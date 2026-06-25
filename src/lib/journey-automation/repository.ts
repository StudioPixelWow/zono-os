// ============================================================================
// ZONO — Journey Automation repository (server-only). All journey_* persistence.
// Strictly org-scoped. Workflow versions are immutable (never deleted).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  AuditEntry, ExecutionMode, ExecutionStatus, StepResult, TriggerEvent, WorkflowGraph,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

const WF = "journey_workflows";
const VER = "journey_workflow_versions";
const TRG = "journey_triggers";
const EXE = "journey_executions";
const STEP = "journey_execution_steps";
const TPL = "journey_templates";
const DELAY = "journey_delayed_actions";
const SLA = "journey_sla_rules";
const AUDIT = "journey_audit_log";

export function createJourneyRepository(db: Db) {
  return {
    // ── Workflows + versions ─────────────────────────────────────────────────
    async createWorkflow(orgId: string, userId: string, w: { name: string; description?: string; journeyType: string; triggerType: string | null; graph: WorkflowGraph; status?: string }): Promise<string | null> {
      const { data } = await db.from(WF as never).insert({
        org_id: orgId, name: w.name, description: w.description ?? null, journey_type: w.journeyType,
        trigger_type: w.triggerType, status: w.status ?? "draft", active_version: 1, created_by: userId,
      } as never).select("id").maybeSingle();
      const id = (data as { id: string } | null)?.id ?? null;
      if (id) await db.from(VER as never).insert({ org_id: orgId, workflow_id: id, version: 1, graph: w.graph, created_by: userId } as never);
      return id;
    },

    /** New immutable version + bump active_version (versions are never deleted). */
    async addVersion(orgId: string, userId: string, workflowId: string, graph: WorkflowGraph, notes?: string): Promise<number> {
      const { data: last } = await db.from(VER as never).select("version").eq("workflow_id", workflowId).order("version", { ascending: false }).limit(1).maybeSingle();
      const next = ((last as { version: number } | null)?.version ?? 0) + 1;
      await db.from(VER as never).insert({ org_id: orgId, workflow_id: workflowId, version: next, graph, notes: notes ?? null, created_by: userId } as never);
      await db.from(WF as never).update({ active_version: next } as never).eq("id", workflowId).eq("org_id", orgId);
      return next;
    },

    async setWorkflowStatus(orgId: string, workflowId: string, status: string, triggerType?: string | null): Promise<void> {
      const patch: Record<string, unknown> = { status };
      if (triggerType !== undefined) patch.trigger_type = triggerType;
      await db.from(WF as never).update(patch as never).eq("id", workflowId).eq("org_id", orgId);
    },

    async listWorkflows(orgId: string): Promise<{ id: string; name: string; journey_type: string; status: string; active_version: number; trigger_type: string | null }[]> {
      const { data } = await db.from(WF as never).select("id, name, journey_type, status, active_version, trigger_type").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200);
      return (data ?? []) as never;
    },

    async getActiveGraph(orgId: string, workflowId: string): Promise<{ version: number; graph: WorkflowGraph } | null> {
      const { data: wf } = await db.from(WF as never).select("active_version").eq("id", workflowId).eq("org_id", orgId).maybeSingle();
      const version = (wf as { active_version: number } | null)?.active_version ?? 1;
      const { data } = await db.from(VER as never).select("version, graph").eq("workflow_id", workflowId).eq("version", version).maybeSingle();
      const row = data as { version: number; graph: WorkflowGraph } | null;
      return row ? { version: row.version, graph: row.graph } : null;
    },

    async activeWorkflowsForTrigger(orgId: string, triggerType: string): Promise<{ id: string; name: string; journey_type: string; active_version: number }[]> {
      const { data } = await db.from(WF as never).select("id, name, journey_type, active_version").eq("org_id", orgId).eq("status", "active").eq("trigger_type", triggerType).limit(50);
      return (data ?? []) as never;
    },

    // ── Executions + steps ───────────────────────────────────────────────────
    async createExecution(orgId: string, userId: string | null, e: { workflowId: string | null; version: number; mode: ExecutionMode; event: TriggerEvent; slaDueAtIso: string | null; stepsTotal: number }): Promise<string | null> {
      const { data, error } = await db.from(EXE as never).insert({
        org_id: orgId, workflow_id: e.workflowId, version: e.version, status: "running", mode: e.mode,
        trigger_type: e.event.triggerType, entity_type: e.event.entityType, entity_id: e.event.entityId, entity_label: e.event.entityLabel,
        context: e.event.context, dedup_key: e.event.dedupKey ?? null, sla_due_at: e.slaDueAtIso, steps_total: e.stepsTotal, created_by: userId,
      } as never).select("id").maybeSingle();
      // Unique (workflow_id, dedup_key) → duplicate dispatch is silently ignored (idempotent).
      if (error) return null;
      return (data as { id: string } | null)?.id ?? null;
    },

    async finishExecution(orgId: string, executionId: string, patch: { status: ExecutionStatus; stepsDone: number; durationMs: number | null; error: string | null; slaBreached?: boolean }): Promise<void> {
      await db.from(EXE as never).update({
        status: patch.status, steps_done: patch.stepsDone, duration_ms: patch.durationMs, error: patch.error,
        sla_breached: patch.slaBreached ?? false, finished_at: patch.status === "delayed" ? null : new Date().toISOString(),
      } as never).eq("id", executionId).eq("org_id", orgId);
    },

    async cancelExecution(orgId: string, executionId: string): Promise<void> {
      await db.from(EXE as never).update({ status: "cancelled", finished_at: new Date().toISOString() } as never).eq("id", executionId).eq("org_id", orgId).in("status", ["running", "waiting", "delayed"] as never);
      await db.from(DELAY as never).update({ status: "cancelled" } as never).eq("execution_id", executionId).eq("status", "pending");
    },

    async insertSteps(orgId: string, executionId: string, steps: StepResult[]): Promise<void> {
      if (steps.length === 0) return;
      await db.from(STEP as never).insert(steps.map((s) => ({
        org_id: orgId, execution_id: executionId, node_id: s.nodeId, node_kind: s.nodeKind, action_type: s.actionType ?? null,
        status: s.status, attempt: s.attempt, output: s.output, branch: s.branch, error: s.error ?? null,
        finished_at: s.status === "done" || s.status === "failed" ? new Date().toISOString() : null,
      })) as never);
    },

    async insertAudit(orgId: string, executionId: string | null, workflowId: string | null, entries: AuditEntry[]): Promise<void> {
      if (entries.length === 0) return;
      await db.from(AUDIT as never).insert(entries.map((a) => ({
        org_id: orgId, execution_id: executionId, workflow_id: workflowId, node_id: a.nodeId,
        event_type: a.eventType, actor: a.actor, reason: a.reason, detail: a.detail,
      })) as never);
    },

    // ── Delay queue ──────────────────────────────────────────────────────────
    async enqueueDelay(orgId: string, executionId: string, nodeId: string, runAtIso: string): Promise<void> {
      await db.from(DELAY as never).insert({ org_id: orgId, execution_id: executionId, node_id: nodeId, run_at: runAtIso, status: "pending" } as never);
    },

    async dueDelays(nowIso: string, limit = 100): Promise<{ id: string; org_id: string; execution_id: string; node_id: string; run_at: string; status: string; attempts: number }[]> {
      const { data } = await db.from(DELAY as never).select("id, org_id, execution_id, node_id, run_at, status, attempts").eq("status", "pending").lte("run_at", nowIso).order("run_at", { ascending: true }).limit(limit);
      return (data ?? []) as never;
    },

    async markDelay(id: string, status: string): Promise<void> {
      await db.from(DELAY as never).update({ status, claimed_at: new Date().toISOString() } as never).eq("id", id);
    },

    async getExecution(orgId: string, executionId: string): Promise<{ workflow_id: string | null; version: number; trigger_type: string | null; entity_type: string | null; entity_id: string | null; entity_label: string | null; context: Record<string, unknown>; status: string } | null> {
      const { data } = await db.from(EXE as never).select("workflow_id, version, trigger_type, entity_type, entity_id, entity_label, context, status").eq("id", executionId).eq("org_id", orgId).maybeSingle();
      return (data as never) ?? null;
    },

    async getVersionGraph(workflowId: string, version: number): Promise<WorkflowGraph | null> {
      const { data } = await db.from(VER as never).select("graph").eq("workflow_id", workflowId).eq("version", version).maybeSingle();
      return ((data as { graph: WorkflowGraph } | null)?.graph) ?? null;
    },

    // ── SLA rules ──────────────────────────────────────────────────────────--
    async listSlaRules(orgId: string): Promise<{ id: string; name: string; applies_to: string; minutes: number; on_breach: unknown[]; active: boolean }[]> {
      const { data } = await db.from(SLA as never).select("id, name, applies_to, minutes, on_breach, active").eq("org_id", orgId).limit(100);
      return (data ?? []) as never;
    },

    async upsertSlaRule(orgId: string, rule: { id?: string; name: string; appliesTo: string; minutes: number; onBreach: unknown[]; active: boolean }): Promise<void> {
      const row = { org_id: orgId, name: rule.name, applies_to: rule.appliesTo, minutes: rule.minutes, on_breach: rule.onBreach, active: rule.active };
      if (rule.id) await db.from(SLA as never).update(row as never).eq("id", rule.id).eq("org_id", orgId);
      else await db.from(SLA as never).insert(row as never);
    },

    // ── Templates ──────────────────────────────────────────────────────────--
    async listTemplates(orgId: string): Promise<{ id: string; key: string; name: string; description: string | null; journey_type: string; graph: WorkflowGraph; is_system: boolean }[]> {
      const { data } = await db.from(TPL as never).select("id, key, name, description, journey_type, graph, is_system").or(`org_id.is.null,org_id.eq.${orgId}`).limit(100);
      return (data ?? []) as never;
    },

    async registerTrigger(orgId: string, workflowId: string, triggerType: string): Promise<void> {
      await db.from(TRG as never).insert({ org_id: orgId, workflow_id: workflowId, trigger_type: triggerType, active: true } as never);
    },

    // ── Dashboard reads ──────────────────────────────────────────────────────
    async executionRows(orgId: string, limit = 400): Promise<{ id: string; workflow_id: string | null; status: string; mode: string; trigger_type: string | null; entity_label: string | null; started_at: string | null; duration_ms: number | null; sla_breached: boolean; steps_done: number; steps_total: number }[]> {
      const { data } = await db.from(EXE as never).select("id, workflow_id, status, mode, trigger_type, entity_label, started_at, duration_ms, sla_breached, steps_done, steps_total").eq("org_id", orgId).order("started_at", { ascending: false }).limit(limit);
      return (data ?? []) as never;
    },

    async doneActionStepCounts(orgId: string): Promise<Record<string, number>> {
      const { data } = await db.from(STEP as never).select("action_type, status").eq("org_id", orgId).eq("status", "done").eq("node_kind", "action").limit(5000);
      const out: Record<string, number> = {};
      for (const r of ((data ?? []) as unknown as { action_type: string | null }[])) {
        const a = r.action_type;
        if (a && a !== "wait" && a !== "end") out[a] = (out[a] ?? 0) + 1;
      }
      return out;
    },

    async recentAudit(orgId: string, limit = 40): Promise<{ id: string; execution_id: string | null; node_id: string | null; event_type: string; actor: string; reason: string | null; created_at: string }[]> {
      const { data } = await db.from(AUDIT as never).select("id, execution_id, node_id, event_type, actor, reason, created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
      return (data ?? []) as never;
    },

    async workflowNames(orgId: string): Promise<Map<string, { name: string; journeyType: string }>> {
      const { data } = await db.from(WF as never).select("id, name, journey_type").eq("org_id", orgId).limit(300);
      const m = new Map<string, { name: string; journeyType: string }>();
      for (const r of ((data ?? []) as unknown as { id: string; name: string; journey_type: string }[])) m.set(r.id, { name: r.name, journeyType: r.journey_type });
      return m;
    },
  };
}

export type JourneyRepository = ReturnType<typeof createJourneyRepository>;
