// ============================================================================
// ZONO — Journey execution engine (pure, deterministic). Walks the workflow DAG
// from the trigger, evaluating conditions, fanning out splits (parallel),
// joining merges, and invoking an INJECTED action handler with retries. Delays
// pause a branch (durable queue resumes via resumeWorkflow). Simulation Mode
// fast-forwards delays and never performs side effects.
//
// Determinism: same graph + same event + same handler outcomes ⇒ same result.
// Idempotency + "no duplicated execution" are enforced at the DB layer
// (journey_executions unique (workflow_id, dedup_key)); this engine never
// processes the same node twice within a pass.
// ============================================================================
import type {
  AuditEntry, ExecutionMode, ExecutionResult, StepResult, TriggerContext, TriggerEvent,
  WorkflowGraph, WorkflowNode,
} from "./types";
import { nodeById, outgoing, indegree } from "./engine";
import { evaluateConditions } from "./conditions";
import { delayMinutesOf } from "./delays";

/** Outcome an action handler returns. Pure + deterministic per (node, attempt). */
export interface ActionOutcome {
  ok: boolean;
  output?: Record<string, unknown>;
  retryable?: boolean;
  error?: string;
}

export type ActionHandler = (node: WorkflowNode, ctx: TriggerContext, attempt: number) => ActionOutcome;

export interface ExecuteOptions {
  mode?: ExecutionMode;
  handler?: ActionHandler;        // side-effect handler; omitted ⇒ no-op success (pure preview)
  maxAttempts?: number;           // retry budget per action (default 3)
  /** Resume from these node ids instead of the trigger (durable delay queue). */
  fromNodeIds?: string[];
  audit?: AuditEntry[];           // accumulate into an existing audit list
}

const DEFAULT_HANDLER: ActionHandler = () => ({ ok: true, output: {} });

function audit(list: AuditEntry[], eventType: string, nodeId: string | null, reason: string, detail: Record<string, unknown> = {}): void {
  list.push({ eventType, nodeId, actor: "system", reason, detail });
}

/**
 * Execute (or simulate) a workflow for a trigger event.
 * Retries: a failing retryable action is retried up to maxAttempts.
 * Parallel: split fans out; merge waits for all reachable incoming branches.
 * Delays: execution mode records a pendingDelay and stops that branch.
 */
export function executeWorkflow(graph: WorkflowGraph, event: TriggerEvent, opts: ExecuteOptions = {}): ExecutionResult {
  const mode: ExecutionMode = opts.mode ?? "execution";
  const handler = mode === "simulation" ? DEFAULT_HANDLER : (opts.handler ?? DEFAULT_HANDLER);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const map = nodeById(graph);
  const indeg = indegree(graph);
  const auditLog: AuditEntry[] = opts.audit ?? [];

  const steps: StepResult[] = [];
  const pendingDelays: { nodeId: string; runAtOffsetMinutes: number }[] = [];
  const processed = new Set<string>();           // a node is processed at most once per pass
  const mergeArrivals = new Map<string, number>();
  let anyFailed = false;

  // Seed the frontier.
  const startIds = opts.fromNodeIds && opts.fromNodeIds.length
    ? opts.fromNodeIds
    : (() => { const t = graph.nodes.find((n) => n.kind === "trigger"); return t ? [t.id] : []; })();
  const queue: string[] = [...startIds];
  if (!opts.fromNodeIds?.length) audit(auditLog, "trigger_fired", startIds[0] ?? null, `trigger ${event.triggerType}`, { entity: event.entityLabel });

  const ctx: TriggerContext = event.context;

  while (queue.length) {
    const id = queue.shift()!;
    if (processed.has(id)) continue;
    const node = map.get(id);
    if (!node) continue;

    // merge: only proceed once all reachable incoming edges have arrived.
    if (node.kind === "merge") {
      const arrived = (mergeArrivals.get(id) ?? 0) + 1;
      mergeArrivals.set(id, arrived);
      if (arrived < (indeg.get(id) ?? 1)) continue; // wait for siblings
    }
    processed.add(id);

    const enqueueSuccessors = (branch?: "true" | "false") => {
      for (const e of outgoing(graph, node.id)) {
        if (node.kind === "condition" && branch && (e.branch ?? "true") !== branch && e.branch != null) continue;
        queue.push(e.to);
      }
    };

    switch (node.kind) {
      case "trigger": {
        steps.push(step(node, "done", 0, { triggerType: event.triggerType }, null));
        enqueueSuccessors();
        break;
      }
      case "condition": {
        const res = evaluateConditions(node.conditions ?? [], ctx);
        steps.push(step(node, "done", 0, { passed: res.passed, failed: res.failed }, res.passed ? "true" : "false"));
        audit(auditLog, "condition_evaluated", node.id, res.passed ? "passed" : "failed", { failed: res.failed });
        enqueueSuccessors(res.passed ? "true" : "false");
        break;
      }
      case "split": {
        steps.push(step(node, "done", 0, {}, null));
        enqueueSuccessors(); // parallel fan-out
        break;
      }
      case "merge": {
        steps.push(step(node, "done", 0, {}, null));
        enqueueSuccessors();
        break;
      }
      case "delay": {
        const minutes = delayMinutesOf(node);
        if (mode === "simulation") {
          steps.push({ ...step(node, "done", 0, { simulatedDelayMinutes: minutes }, null) });
          audit(auditLog, "delay_fast_forwarded", node.id, `simulate ${minutes}m`);
          enqueueSuccessors();
        } else {
          steps.push({ ...step(node, "waiting", 0, { delayMinutes: minutes }, null), scheduledAt: null });
          pendingDelays.push({ nodeId: node.id, runAtOffsetMinutes: minutes });
          audit(auditLog, "delay_scheduled", node.id, `wait ${minutes}m`);
          // branch pauses here — successors resumed by the durable queue.
        }
        break;
      }
      case "end": {
        steps.push(step(node, "done", 0, {}, null));
        audit(auditLog, "journey_ended", node.id, "end node");
        break;
      }
      case "action": {
        if (node.actionType === "wait") {
          const minutes = delayMinutesOf(node);
          if (mode === "simulation") { steps.push(step(node, "done", 0, { simulatedDelayMinutes: minutes }, null)); enqueueSuccessors(); }
          else { steps.push({ ...step(node, "waiting", 0, { delayMinutes: minutes }, null) }); pendingDelays.push({ nodeId: node.id, runAtOffsetMinutes: minutes }); audit(auditLog, "delay_scheduled", node.id, `wait ${minutes}m`); }
          break;
        }
        if (node.actionType === "end") { steps.push(step(node, "done", 0, {}, null)); audit(auditLog, "journey_ended", node.id, "end action"); break; }

        // Invoke handler with retries.
        let attempt = 0;
        let outcome: ActionOutcome = { ok: false };
        while (attempt < maxAttempts) {
          attempt++;
          outcome = handler(node, ctx, attempt);
          if (outcome.ok) break;
          audit(auditLog, "step_retry", node.id, outcome.error ?? "retry", { attempt });
          if (!outcome.retryable) break;
        }
        if (outcome.ok) {
          steps.push(step(node, "done", attempt, outcome.output ?? {}, null));
          audit(auditLog, "step_done", node.id, node.actionType ?? "action", { attempt });
          enqueueSuccessors();
        } else {
          anyFailed = true;
          steps.push({ ...step(node, "failed", attempt, {}, null), error: outcome.error ?? "failed" });
          audit(auditLog, "step_failed", node.id, outcome.error ?? "failed", { attempt });
          // failed branch stops; other parallel branches continue.
        }
        break;
      }
    }
  }

  const stepsDone = steps.filter((s) => s.status === "done").length;
  const status: ExecutionResult["status"] =
    pendingDelays.length > 0 ? "delayed" : anyFailed ? "failed" : "completed";

  return { status, mode, steps, stepsTotal: steps.length, stepsDone, pendingDelays, audit: auditLog, error: anyFailed ? "אחת או יותר מהפעולות נכשלה." : undefined };
}

/** Resume a delayed branch from the successors of a delay node (durable queue). */
export function resumeWorkflow(graph: WorkflowGraph, event: TriggerEvent, delayNodeId: string, opts: ExecuteOptions = {}): ExecutionResult {
  const successors = outgoing(graph, delayNodeId).map((e) => e.to);
  return executeWorkflow(graph, event, { ...opts, fromNodeIds: successors });
}

function step(node: WorkflowNode, status: StepResult["status"], attempt: number, output: Record<string, unknown>, branch: string | null): StepResult {
  return { nodeId: node.id, nodeKind: node.kind, actionType: node.actionType, status, attempt, output, branch };
}
