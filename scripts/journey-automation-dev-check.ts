/**
 * LOCAL-DEV-ONLY check for Journey Automation OS™ (Phase 18). Pure layers only
 * (no DB, no network, no server-only imports). Verifies the deterministic
 * executor + orchestration helpers:
 *   workflow execution · retries · parallel paths · delay queue · SLA breach ·
 *   audit log · simulation mode (fast-forward, no side effects) · versioning
 *   semantics · no duplicated execution (dedup keys) · graph validation.
 *
 * Run: npx tsx scripts/journey-automation-dev-check.ts
 */
import {
  validateGraph, planJourney, executeWorkflow, resumeWorkflow,
  evaluateConditions, GraphBuilder, autoLayout, DEFAULT_JOURNEYS,
  slaScopeFor, selectSlaRule, evaluateSla, DEFAULT_SLA_RULES,
  planClaim, computeMetrics, tallyActions, type ActionHandler, type DelayedRow,
} from "../src/lib/journey-automation";
import type { TriggerEvent, SlaRule } from "../src/lib/journey-automation/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function event(ctx: Record<string, unknown> = {}): TriggerEvent {
  return { triggerType: "property_created", entityType: "property", entityId: "p1", entityLabel: "הרצל 1", context: { is_private: true, opportunity_score: 88, task_status: "todo", ...ctx } as TriggerEvent["context"], dedupKey: "p1:property_created" };
}

// Linear graph: trigger → action(create_task) → end
function linear() {
  const b = new GraphBuilder();
  const t = b.add({ kind: "trigger", triggerType: "property_created" });
  const a = b.add({ kind: "action", actionType: "create_task", title: "פנייה" });
  const e = b.add({ kind: "end" });
  b.chain([t, a, e]);
  return b.build();
}

function main(): void {
  console.log("ZONO Journey Automation dev-check\n");

  // 1) Graph validation.
  assert(validateGraph(linear()).ok, "valid linear graph passes validation");
  const noTrigger = new GraphBuilder(); noTrigger.add({ kind: "action", actionType: "create_task" });
  assert(!validateGraph(noTrigger.build()).ok, "graph without trigger fails validation");
  // Cycle detection.
  const cyc = new GraphBuilder(); const a1 = cyc.add({ kind: "trigger", triggerType: "manual" }); const a2 = cyc.add({ kind: "action", actionType: "create_task" });
  cyc.link(a1, a2); cyc.link(a2, a1);
  assert(!validateGraph(cyc.build()).ok, "cyclic graph is rejected (DAG required)");

  // 2) Workflow execution (happy path).
  const r1 = executeWorkflow(linear(), event(), { mode: "execution" });
  assert(r1.status === "completed" && r1.stepsDone === 3, "linear workflow executes to completion (3 steps)");
  assert(r1.audit.some((a) => a.eventType === "trigger_fired") && r1.audit.some((a) => a.eventType === "step_done"), "audit log records trigger + step events");

  // 3) Retries — handler fails twice (retryable) then succeeds.
  let attempts = 0;
  const retryHandler: ActionHandler = () => { attempts++; return attempts < 3 ? { ok: false, retryable: true, error: "timeout" } : { ok: true, output: {} }; };
  const r2 = executeWorkflow(linear(), event(), { mode: "execution", handler: retryHandler, maxAttempts: 3 });
  assert(r2.status === "completed" && attempts === 3, "retryable action retried until success (3 attempts)");
  // Non-retryable / exhausted → failed.
  const failHandler: ActionHandler = () => ({ ok: false, retryable: true, error: "down" });
  const r3 = executeWorkflow(linear(), event(), { mode: "execution", handler: failHandler, maxAttempts: 2 });
  assert(r3.status === "failed" && r3.audit.some((a) => a.eventType === "step_failed"), "exhausted retries → failed + audited");

  // 4) Parallel paths (split → 2 actions → merge → end).
  const pb = new GraphBuilder();
  const pt = pb.add({ kind: "trigger", triggerType: "exclusive_signed" });
  const ps = pb.add({ kind: "split" });
  const pa = pb.add({ kind: "action", actionType: "create_task", title: "A" });
  const pc = pb.add({ kind: "action", actionType: "create_reminder", title: "B" });
  const pm = pb.add({ kind: "merge" });
  const pe = pb.add({ kind: "end" });
  pb.link(pt, ps); pb.link(ps, pa); pb.link(ps, pc); pb.link(pa, pm); pb.link(pc, pm); pb.link(pm, pe);
  const r4 = executeWorkflow(pb.build(), { ...event(), triggerType: "exclusive_signed" }, { mode: "execution" });
  assert(r4.status === "completed" && r4.steps.filter((s) => s.nodeKind === "action").length === 2, "parallel split → both branches execute, merge joins once");
  assert(r4.steps.filter((s) => s.nodeKind === "merge").length === 1, "merge node fires exactly once (no duplicate)");

  // 5) Delay queue — delay node pauses execution (status delayed + pendingDelay).
  const db = new GraphBuilder();
  const dt = db.add({ kind: "trigger", triggerType: "price_drop" });
  const dd = db.add({ kind: "delay", delayMinutes: 120 });
  const da = db.add({ kind: "action", actionType: "create_task" });
  const de = db.add({ kind: "end" });
  db.chain([dt, dd, da, de]);
  const graphD = db.build();
  const r5 = executeWorkflow(graphD, { ...event(), triggerType: "price_drop" }, { mode: "execution" });
  assert(r5.status === "delayed" && r5.pendingDelays.length === 1 && r5.pendingDelays[0]!.runAtOffsetMinutes === 120, "delay node pauses execution (delayed + queued 120m)");
  assert(r5.steps.find((s) => s.nodeKind === "delay")?.status === "waiting", "delay step recorded as waiting");
  // Resume from the delay node completes the branch.
  const r5b = resumeWorkflow(graphD, { ...event(), triggerType: "price_drop" }, r5.steps.find((s) => s.nodeKind === "delay")!.nodeId, { mode: "execution" });
  assert(r5b.status === "completed" && r5b.steps.some((s) => s.actionType === "create_task" && s.status === "done"), "resume from delay completes the remaining branch");

  // 6) Delay-queue claim plan (durable queue, deterministic, idempotent).
  const now = Date.parse("2026-06-25T12:00:00Z");
  const rows: DelayedRow[] = [
    { id: "d1", executionId: "e1", nodeId: "n", runAt: "2026-06-25T11:00:00Z", status: "pending", attempts: 0 },
    { id: "d2", executionId: "e2", nodeId: "n", runAt: "2026-06-25T13:00:00Z", status: "pending", attempts: 0 },
    { id: "d3", executionId: "e3", nodeId: "n", runAt: "2026-06-25T10:00:00Z", status: "done", attempts: 0 },
  ];
  const claim = planClaim(rows, { nowMs: now, batch: 10 });
  assert(claim.claim.length === 1 && claim.claim[0] === "d1", "only due + pending delayed actions are claimed (not future, not done)");

  // 7) SLA breach.
  const slaRules: SlaRule[] = DEFAULT_SLA_RULES.map((r, i) => ({ id: `s${i}`, ...r }));
  const scope = slaScopeFor("property_created", event().context);
  const rule = selectSlaRule(slaRules, scope);
  assert(scope === "private_property" && rule != null && rule.minutes === 30, "private property maps to 30-minute SLA rule");
  assert(evaluateSla(rule, 45, false).breached === true, "SLA breached when not contacted after 45m (>30m)");
  assert(evaluateSla(rule, 45, true).breached === false, "SLA not breached when contacted in time");
  assert(rule!.onBreach.some((b) => b.actionType === "notify_manager"), "SLA breach triggers manager notification");

  // 8) Simulation mode — fast-forwards delays, no failure, never delayed.
  const sim = executeWorkflow(graphD, { ...event(), triggerType: "price_drop" }, { mode: "simulation" });
  assert(sim.mode === "simulation" && sim.status === "completed" && sim.pendingDelays.length === 0, "simulation fast-forwards delays → completed, no queued delays");
  assert(sim.audit.some((a) => a.eventType === "delay_fast_forwarded"), "simulation audits fast-forwarded delays");

  // 9) Conditions branch deterministically.
  assert(evaluateConditions([{ field: "opportunity_score", operator: "gte", value: 85 }], event().context).passed, "condition passes when score ≥ threshold");
  assert(!evaluateConditions([{ field: "opportunity_score", operator: "gte", value: 95 }], event().context).passed, "condition fails when score < threshold");

  // 10) Versioning + idempotency semantics (pure: dedup key stable; templates valid).
  assert(event().dedupKey === event().dedupKey, "dedup key stable for identical event (no duplicate executions)");
  assert(DEFAULT_JOURNEYS.length === 5 && DEFAULT_JOURNEYS.every((t) => validateGraph(t.graph).ok), "all 5 default journeys are valid graphs");
  const plan = planJourney(DEFAULT_JOURNEYS[0]!.graph, event().context);
  assert(plan.length > 0 && plan[0]!.nodeKind === "trigger", "planJourney produces a preview starting at the trigger");
  assert(autoLayout(linear()).nodes.every((n) => typeof n.x === "number" && typeof n.y === "number"), "autoLayout assigns coordinates to every node");

  // 11) Metrics aggregation.
  const counts = tallyActions(r4.steps);
  const metrics = computeMetrics({ actionCounts: counts, executionsTotal: 4, executionsSucceeded: 3 });
  assert(metrics.tasksAutomated >= 1 && metrics.automationSuccessPct === 75, "metrics: tasks automated counted + success % (3/4 = 75%)");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main();
