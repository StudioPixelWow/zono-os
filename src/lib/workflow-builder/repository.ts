// ============================================================================
// 🗄️ Workflow Builder — persistence (server-only). 30.4.1.
// Persists workflows/steps/history to zono_workflow* (service-role writes) and
// reconstructs the pure Workflow object on load. Degrades gracefully if the
// migration hasn't been applied (returns a clear signal). Never throws.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTemplate } from "./templates";
import type { Workflow, WorkflowStep, WorkflowContext, WorkflowHistoryEntry, WorkflowStatus, TriggerType, EntityKind, StepKind, StepStatus, ActionType } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const isMissing = (m: string) => /does not exist|relation .* does not exist|schema cache|could not find the table/i.test(m);
export class WorkflowsTableMissing extends Error { constructor() { super("zono_workflows tables missing — run the 30.4.1 migration."); } }

const W = "zono_workflows", WS = "zono_workflow_steps", WH = "zono_workflow_history";

export interface PersistedWorkflow { workflow: Workflow; context: WorkflowContext; createdMissionByStep: Record<string, string | null> }

function rebuildStep(r: Row, templateId: string): WorkflowStep {
  const stepKey = s(r.step_key);
  const tmplStep = getTemplate(templateId)?.steps.find((x) => x.id === stepKey) ?? null;
  return {
    id: stepKey, order: Number(r.step_order) || 0, title: s(r.title),
    kind: s(r.kind) as StepKind, action: (sn(r.action) as ActionType | null), missionType: sn(r.mission_type),
    condition: tmplStep?.condition ?? null, requiresApproval: !!r.requires_approval,
    status: s(r.status) as StepStatus, why: s(r.why), blockedReason: sn(r.blocked_reason), outcome: sn(r.outcome),
  };
}

function rowsToWorkflow(wf: Row, steps: Row[], hist: Row[]): PersistedWorkflow {
  const templateId = s(wf.template_id);
  const stepObjs = [...steps].sort((a, b) => (Number(a.step_order) || 0) - (Number(b.step_order) || 0)).map((r) => rebuildStep(r, templateId));
  const history: WorkflowHistoryEntry[] = [...hist].sort((a, b) => s(a.at).localeCompare(s(b.at))).map((r) => ({ at: s(r.at), stepId: sn(r.step_key), event: s(r.event), note: s(r.note) }));
  const workflow: Workflow = {
    id: s(wf.id), version: s(wf.version) || "30.4.1", createdAt: s(wf.created_at),
    templateId, name: s(wf.name), entityKind: s(wf.entity_type) as EntityKind, entityId: s(wf.entity_id), entityName: s(wf.entity_name),
    trigger: s(wf.trigger) as TriggerType, status: s(wf.status) as WorkflowStatus,
    steps: stepObjs, history,
    progress: (wf.progress as Workflow["progress"]) ?? { total: stepObjs.length, completed: 0, pending: 0, blocked: 0, cancelled: 0, percent: 0, currentStepId: null },
    explain: (wf.explain as Workflow["explain"]) ?? { whyStarted: "", whyWaiting: null, whyBlocked: null, expectedOutcome: "", confidence: 0 },
  };
  const context = (wf.context as WorkflowContext) ?? { truthScore: null, confidence: 50, businessScore: 50, relationshipStrength: null, journeyStage: null, missionState: null, now: Date.now() };
  const createdMissionByStep: Record<string, string | null> = {};
  for (const r of steps) createdMissionByStep[s(r.step_key)] = sn(r.created_mission_id);
  return { workflow, context, createdMissionByStep };
}

/** Insert a freshly-instantiated workflow + its steps + creation history. */
export async function insertWorkflow(orgId: string | null, wf: Workflow, context: WorkflowContext, createdBy: string | null): Promise<{ ok: boolean; id?: string; migrationRequired?: boolean; error?: string }> {
  const db = createServiceRoleClient();
  try {
    const ins = await db.from(W as never).insert({
      organization_id: orgId, template_id: wf.templateId, name: wf.name,
      entity_type: wf.entityKind, entity_id: wf.entityId, entity_name: wf.entityName,
      trigger: wf.trigger, status: wf.status, progress: wf.progress, explain: wf.explain, context, version: wf.version,
      completed_at: wf.status === "completed" ? new Date().toISOString() : null, created_by: createdBy,
    } as never).select("id").single();
    if (ins.error) { if (isMissing(ins.error.message)) return { ok: false, migrationRequired: true, error: "טבלאות התהליכים חסרות — יש להריץ מיגרציית 30.4.1." }; throw new Error(ins.error.message); }
    const id = s((ins.data as Row).id);
    await db.from(WS as never).insert(wf.steps.map((st) => ({
      workflow_id: id, step_key: st.id, step_order: st.order, title: st.title, kind: st.kind, action: st.action,
      mission_type: st.missionType, requires_approval: st.requiresApproval, status: st.status, why: st.why,
      blocked_reason: st.blockedReason, outcome: st.outcome,
    })) as never);
    await db.from(WH as never).insert(wf.history.map((h) => ({ workflow_id: id, at: h.at, step_key: h.stepId, event: h.event, note: h.note })) as never);
    return { ok: true, id };
  } catch (e) { const m = e instanceof Error ? e.message : "שגיאה"; return { ok: false, migrationRequired: isMissing(m), error: m }; }
}

/** Load a persisted workflow (+ its stored context) by id. */
export async function loadWorkflow(id: string): Promise<PersistedWorkflow | null> {
  const db = createServiceRoleClient();
  try {
    const wf = await db.from(W as never).select("*").eq("id", id).maybeSingle();
    if (wf.error || !wf.data) return null;
    const [steps, hist] = await Promise.all([
      db.from(WS as never).select("*").eq("workflow_id", id),
      db.from(WH as never).select("*").eq("workflow_id", id),
    ]);
    return rowsToWorkflow(wf.data as Row, (steps.data as Row[]) ?? [], (hist.data as Row[]) ?? []);
  } catch { return null; }
}

/** Persist an advanced workflow: update workflow scalars + steps + append new history. */
export async function saveAdvance(wf: Workflow, newHistory: WorkflowHistoryEntry[], createdMissionByStep: Record<string, string | null>): Promise<void> {
  const db = createServiceRoleClient();
  try {
    await db.from(W as never).update({
      status: wf.status, progress: wf.progress, explain: wf.explain,
      completed_at: wf.status === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    } as never).eq("id", wf.id);
    for (const st of wf.steps) {
      await db.from(WS as never).update({
        status: st.status, blocked_reason: st.blockedReason, outcome: st.outcome,
        created_mission_id: createdMissionByStep[st.id] ?? null, updated_at: new Date().toISOString(),
      } as never).eq("workflow_id", wf.id).eq("step_key", st.id);
    }
    if (newHistory.length) await db.from(WH as never).insert(newHistory.map((h) => ({ workflow_id: wf.id, at: h.at, step_key: h.stepId, event: h.event, note: h.note })) as never);
  } catch { /* best-effort persist */ }
}

export interface WorkflowSummaryRow { id: string; templateId: string; name: string; entityKind: EntityKind; entityId: string; entityName: string; status: WorkflowStatus; percent: number; updatedAt: string; currentStepId: string | null }
const SUMMARY_COLS = "id,template_id,name,entity_type,entity_id,entity_name,status,progress,updated_at";
const toSummary = (r: Row): WorkflowSummaryRow => {
  const progress = (r.progress as Workflow["progress"]) ?? { percent: 0, currentStepId: null };
  return { id: s(r.id), templateId: s(r.template_id), name: s(r.name), entityKind: s(r.entity_type) as EntityKind, entityId: s(r.entity_id), entityName: s(r.entity_name), status: s(r.status) as WorkflowStatus, percent: progress.percent ?? 0, updatedAt: s(r.updated_at), currentStepId: progress.currentStepId ?? null };
};

export async function listWorkflows(orgId: string | null, statuses: WorkflowStatus[], limit = 50): Promise<{ rows: WorkflowSummaryRow[]; migrationRequired: boolean }> {
  const db = createServiceRoleClient();
  try {
    const q = await db.from(W as never).select(SUMMARY_COLS).in("status", statuses as never).order("updated_at", { ascending: false }).limit(limit);
    if (q.error) return { rows: [], migrationRequired: isMissing(q.error.message) };
    return { rows: ((q.data as Row[]) ?? []).map(toSummary), migrationRequired: false };
  } catch (e) { return { rows: [], migrationRequired: isMissing(e instanceof Error ? e.message : "") }; }
}

const ACTIVE_STATUSES: WorkflowStatus[] = ["draft", "running", "waiting_approval", "blocked"];
/** Active workflows for a specific entity (for badges + duplicate prevention). */
export async function listEntityActiveWorkflows(orgId: string | null, entityType: string, entityId: string): Promise<{ rows: WorkflowSummaryRow[]; migrationRequired: boolean }> {
  const db = createServiceRoleClient();
  try {
    const q = await db.from(W as never).select(SUMMARY_COLS).eq("entity_type", entityType).eq("entity_id", entityId).in("status", ACTIVE_STATUSES as never).order("updated_at", { ascending: false }).limit(20);
    if (q.error) return { rows: [], migrationRequired: isMissing(q.error.message) };
    return { rows: ((q.data as Row[]) ?? []).map(toSummary), migrationRequired: false };
  } catch (e) { return { rows: [], migrationRequired: isMissing(e instanceof Error ? e.message : "") }; }
}
