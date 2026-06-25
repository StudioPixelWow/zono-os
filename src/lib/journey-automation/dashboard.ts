// ============================================================================
// ZONO — Automation dashboard aggregation (pure, deterministic). Turns raw
// execution/audit rows into the dashboard DTO (counts, avg duration, SLA
// compliance, success %, metrics, recents).
// ============================================================================
import { emptyCounts, slaCompliancePct, type MetricsInput } from "./metrics";
import { journeyTypeLabel } from "./workflows";
import type {
  AuditLogRow, AutomationDashboard, AutomationMetrics, ExecutionStatus, ExecutionSummary,
} from "./types";

export interface ExecRow {
  id: string; workflow_id: string | null; status: string; mode: string; trigger_type: string | null;
  entity_label: string | null; started_at: string | null; duration_ms: number | null;
  sla_breached: boolean; steps_done: number; steps_total: number;
}
export interface AuditRow { id: string; execution_id: string | null; node_id: string | null; event_type: string; actor: string; reason: string | null; created_at: string }

/** Adapt persisted done-action counts into the metrics input. */
export function tallyActionsFromCounts(actionCounts: Record<string, number>, executionsTotal: number): MetricsInput {
  // executionsSucceeded is recomputed from rows in buildDashboard; here we pass a
  // conservative estimate (orchestrator persists success separately). Kept simple.
  return { actionCounts, executionsTotal, executionsSucceeded: executionsTotal };
}

export function buildDashboard(
  rows: ExecRow[], names: Map<string, { name: string; journeyType: string }>, audit: AuditRow[], metrics: AutomationMetrics,
): AutomationDashboard {
  const counts = emptyCounts();
  let durSum = 0, durN = 0, slaTotal = 0, slaBreached = 0, terminal = 0, succeeded = 0;
  for (const r of rows) {
    const s = r.status as ExecutionStatus;
    if (s in counts) counts[s as keyof typeof counts]++;
    if (typeof r.duration_ms === "number") { durSum += r.duration_ms; durN++; }
    if (r.sla_breached || r.status === "completed") { slaTotal++; if (r.sla_breached) slaBreached++; }
    if (s === "completed" || s === "failed") { terminal++; if (s === "completed") succeeded++; }
  }
  const automationSuccessPct = terminal > 0 ? Math.round((succeeded / terminal) * 100) : 0;

  const recentExecutions: ExecutionSummary[] = rows.slice(0, 25).map((r) => {
    const wf = r.workflow_id ? names.get(r.workflow_id) : undefined;
    return {
      id: r.id, workflowName: wf?.name ?? null, journeyType: wf ? journeyTypeLabel(wf.journeyType) : null,
      status: r.status as ExecutionStatus, mode: r.mode as ExecutionSummary["mode"], entityLabel: r.entity_label,
      triggerType: r.trigger_type, startedAt: r.started_at, durationMs: r.duration_ms, slaBreached: r.sla_breached,
      stepsDone: r.steps_done, stepsTotal: r.steps_total,
    };
  });

  const recentAudit: AuditLogRow[] = audit.map((a) => ({
    id: a.id, executionId: a.execution_id, nodeId: a.node_id, eventType: a.event_type, actor: a.actor, reason: a.reason, createdAt: a.created_at,
  }));

  return {
    counts, avgDurationMs: durN > 0 ? Math.round(durSum / durN) : 0,
    slaCompliancePct: slaCompliancePct(slaTotal, slaBreached),
    automationSuccessPct,
    metrics: { ...metrics, automationSuccessPct },
    recentExecutions, recentAudit, workflows: [], generatedAt: new Date().toISOString(),
  };
}
