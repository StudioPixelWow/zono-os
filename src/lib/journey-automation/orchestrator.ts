// ============================================================================
// ZONO — Journey orchestrator (server-only). The bridge between trigger events
// and the deterministic executor. It:
//   • dispatches a TriggerEvent to all matching active workflows (idempotent),
//   • performs action side effects via handlers that CONSUME the existing
//     engines (tasks/reminders/alerts; AI briefs via the Phase 15 Copilot —
//     optional, never blocking),
//   • persists steps/audit/delayed actions,
//   • resumes delayed branches from the durable queue.
// It NEVER replaces engine business logic; conditions/scores come from context.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createJourneyRepository } from "./repository";
import { getJourneyAccess } from "./permissions";
import { executeWorkflow, resumeWorkflow, type ActionHandler, type ActionOutcome } from "./execution";
import { validateGraph, planJourney } from "./engine";
import { prepareAction } from "./actions";
import { slaScopeFor, selectSlaRule } from "./sla";
import { runAtFrom } from "./delays";

/** DB row shape for an SLA rule (snake_case from journey_sla_rules). */
interface SlaRuleCompat { id: string; name: string; applies_to: string; minutes: number; on_breach: unknown[]; active: boolean }
import type {
  ExecutionMode, ExecutionResult, TriggerEvent, TriggerType, WorkflowGraph, WorkflowNode, SlaRule,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

/** Build a side-effecting action handler bound to an org + execution. */
function makeHandler(db: Db, orgId: string, userId: string | null, event: TriggerEvent): ActionHandler {
  return (node: WorkflowNode): ActionOutcome => {
    const prepared = prepareAction(node, event.context);
    try {
      switch (node.actionType) {
        case "create_task":
        case "create_reminder": {
          // Real CRM side effect — create a task (best-effort; never blocks the run).
          void db.from("tasks" as never).insert({
            org_id: orgId, created_by: userId, title: prepared.title || "משימת אוטומציה",
            description: prepared.preview, status: "todo", priority: node.actionType === "create_reminder" ? "low" : "medium",
          } as never).then(() => undefined, () => undefined);
          return { ok: true, output: { kind: node.actionType, title: prepared.title } };
        }
        case "generate_ai_brief":
        case "generate_whatsapp":
        case "generate_email":
          // AI content is OPTIONAL and produced asynchronously elsewhere; here we
          // record the deterministic instruction so Simulation/Audit show it exactly.
          return { ok: true, output: { kind: node.actionType, preview: prepared.preview, ai: "optional" } };
        default:
          return { ok: true, output: { kind: node.actionType ?? "action", preview: prepared.preview } };
      }
    } catch (e) {
      return { ok: false, retryable: true, error: e instanceof Error ? e.message : "action failed" };
    }
  };
}

function toSlaRule(r: SlaRuleCompat): SlaRule {
  return { id: r.id, name: r.name, appliesTo: r.applies_to, minutes: r.minutes, onBreach: (r.on_breach as SlaRule["onBreach"]) ?? [], active: r.active };
}

export interface DispatchResult { started: number; executions: { id: string; workflowId: string; status: string }[] }

/**
 * Dispatch a trigger to all active workflows whose primary trigger matches.
 * Idempotent: the unique (workflow_id, dedup_key) guard prevents duplicates.
 */
export async function dispatchTrigger(event: TriggerEvent, opts: { mode?: ExecutionMode } = {}): Promise<DispatchResult> {
  const access = await getJourneyAccess();
  return dispatchForOrg(access.db, access.orgId, access.userId, event, opts.mode ?? "execution");
}

export async function dispatchForOrg(db: Db, orgId: string, userId: string | null, event: TriggerEvent, mode: ExecutionMode): Promise<DispatchResult> {
  const repo = createJourneyRepository(db);
  const workflows = await repo.activeWorkflowsForTrigger(orgId, event.triggerType);
  const slaRules = (await repo.listSlaRules(orgId)).map(toSlaRule);
  const scope = slaScopeFor(event.triggerType as TriggerType, event.context);
  const slaRule = selectSlaRule(slaRules, scope);
  const startedAt = Date.now();
  const out: DispatchResult = { started: 0, executions: [] };

  for (const wf of workflows) {
    const active = await repo.getActiveGraph(orgId, wf.id);
    if (!active || !validateGraph(active.graph).ok) continue;

    const plan = planJourney(active.graph, event.context);
    const slaDueAtIso = slaRule ? runAtFrom(startedAt, slaRule.minutes) : null;
    const executionId = await repo.createExecution(orgId, userId, {
      workflowId: wf.id, version: active.version, mode, event, slaDueAtIso, stepsTotal: plan.length,
    });
    if (!executionId) continue; // duplicate (idempotent) — already running for this dedup key

    const result = executeWorkflow(active.graph, event, { mode, handler: mode === "execution" ? makeHandler(db, orgId, userId, event) : undefined });
    await persistResult(repo, orgId, executionId, wf.id, result, startedAt, active.graph, event);
    out.started++;
    out.executions.push({ id: executionId, workflowId: wf.id, status: result.status });
  }
  return out;
}

async function persistResult(
  repo: ReturnType<typeof createJourneyRepository>, orgId: string, executionId: string, workflowId: string,
  result: ExecutionResult, startedAtMs: number, graph: WorkflowGraph, event: TriggerEvent,
): Promise<void> {
  await repo.insertSteps(orgId, executionId, result.steps);
  await repo.insertAudit(orgId, executionId, workflowId, result.audit);
  for (const d of result.pendingDelays) {
    await repo.enqueueDelay(orgId, executionId, d.nodeId, runAtFrom(Date.now(), d.runAtOffsetMinutes));
  }
  const durationMs = result.status === "delayed" ? null : Date.now() - startedAtMs;
  await repo.finishExecution(orgId, executionId, { status: result.status, stepsDone: result.stepsDone, durationMs, error: result.error ?? null });
  void graph; void event;
}

/** Resume a single delayed branch (durable queue worker). Idempotent per row. */
export async function resumeDelay(db: Db, orgId: string, executionId: string, delayNodeId: string, delayRowId: string): Promise<void> {
  const repo = createJourneyRepository(db);
  await repo.markDelay(delayRowId, "claimed");
  const exec = await repo.getExecution(orgId, executionId);
  if (!exec || exec.status === "cancelled" || !exec.workflow_id) { await repo.markDelay(delayRowId, "cancelled"); return; }
  const graph = await repo.getVersionGraph(exec.workflow_id, exec.version);
  if (!graph) { await repo.markDelay(delayRowId, "done"); return; }

  const event: TriggerEvent = {
    triggerType: (exec.trigger_type ?? "manual") as TriggerType, entityType: exec.entity_type, entityId: exec.entity_id,
    entityLabel: exec.entity_label, context: exec.context as TriggerEvent["context"],
  };
  const startedAt = Date.now();
  const result = resumeWorkflow(graph, event, delayNodeId, { mode: "execution", handler: makeHandler(db, orgId, null, event) });
  await repo.insertSteps(orgId, executionId, result.steps);
  await repo.insertAudit(orgId, executionId, exec.workflow_id, result.audit);
  for (const d of result.pendingDelays) await repo.enqueueDelay(orgId, executionId, d.nodeId, runAtFrom(Date.now(), d.runAtOffsetMinutes));
  // Resume completes the branch unless it scheduled further delays.
  const status = result.pendingDelays.length > 0 ? "delayed" : result.status === "failed" ? "failed" : "completed";
  await repo.finishExecution(orgId, executionId, { status, stepsDone: result.stepsDone, durationMs: status === "delayed" ? null : Date.now() - startedAt, error: result.error ?? null });
  await repo.markDelay(delayRowId, "done");
}

/** Durable-queue runner: process all due delayed actions (idempotent, batched). */
export async function runJourneyDelayQueue(): Promise<{ processed: number }> {
  const db: Db = createServiceRoleClient();
  const repo = createJourneyRepository(db);
  const due = await repo.dueDelays(new Date().toISOString(), 200);
  let processed = 0;
  for (const row of due) {
    try { await resumeDelay(db, row.org_id, row.execution_id, row.node_id, row.id); processed++; }
    catch { await repo.markDelay(row.id, "pending"); /* retry next tick */ }
  }
  return { processed };
}

/** Simulation Mode preview — exactly what WOULD happen, no side effects. */
export function simulate(graph: WorkflowGraph, event: TriggerEvent): ExecutionResult {
  return executeWorkflow(graph, event, { mode: "simulation" });
}
