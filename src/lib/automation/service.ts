// ============================================================================
// ZONO — Automation & Workflow OS · Service (server-only)
// ----------------------------------------------------------------------------
// Human-supervised orchestration. A run is created in 'pending_review' with
// PREPARED actions. A human approves -> low-risk, reversible artifacts are
// materialized (task / opportunity / notification / activity); everything else
// is tracked as a queued item the human enacts. Reverse undoes materialized
// artifacts. No autonomous communication. Permission-aware (manager vs agent).
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getSessionContext } from "@/lib/auth/session";
import {
  buildPreparedActions, evaluateConditions, summarizeRuns, actionMeta,
  type StepDef, type ConditionDef, type RunEntity, type TriggerContext,
} from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface WorkflowSummary {
  id: string; name: string; description: string | null; category: string; status: string;
  is_enabled: boolean; trigger_type: string; scope: string; run_count: number;
  last_run_at: string | null; tasks_generated: number; opportunities_generated: number;
  template_key: string | null; owner_user_id: string | null;
}
export interface RunSummary {
  id: string; workflow_id: string; workflow_name: string; status: string; trigger_type: string;
  entity_type: string | null; entity_label: string | null; actions_prepared: number;
  actions_applied: number; opportunities_generated: number; blocked_reason: string | null;
  error_message: string | null; created_at: string; owner_user_id: string | null;
}
export interface ActionSummary {
  id: string; run_id: string; action_type: string; title: string; description: string | null;
  status: string; entity_type: string | null; applied_table: string | null; applied_id: string | null;
}
export interface TemplateSummary {
  template_key: string; name: string; description: string | null; category: string;
  trigger_type: string; default_steps: { action_type: string; title?: string }[];
}
export interface AutomationRecoSummary {
  id: string; title: string; reason: string | null; category: string; impact_score: number; template_key: string | null;
}
export interface AutomationAnalytics {
  workflowsTotal: number; workflowsEnabled: number; runsTotal: number; runsApplied: number;
  pending: number; completedToday: number; failed: number; blocked: number;
  tasksGenerated: number; opportunitiesGenerated: number;
}
export interface AutomationCommandCenter {
  workflows: WorkflowSummary[]; runs: RunSummary[]; templates: TemplateSummary[];
  recommendations: AutomationRecoSummary[]; analytics: AutomationAnalytics; isManager: boolean;
}

// ── reads ────────────────────────────────────────────────────────────────────
export async function getAutomationCommandCenter(): Promise<AutomationCommandCenter> {
  const { orgId, userId, isManager, supabase } = await ctx();

  let wfQ = supabase.from("automation_workflows").select("*").eq("organization_id", orgId).order("updated_at", { ascending: false }).limit(200);
  if (!isManager) wfQ = wfQ.or(`scope.eq.org,owner_user_id.eq.${userId}`);
  const { data: wfData } = await wfQ;
  const workflows: WorkflowSummary[] = ((wfData ?? []) as Record<string, unknown>[]).map((w) => ({
    id: w.id as string, name: w.name as string, description: (w.description as string) ?? null,
    category: w.category as string, status: w.status as string, is_enabled: Boolean(w.is_enabled),
    trigger_type: w.trigger_type as string, scope: w.scope as string, run_count: (w.run_count as number) ?? 0,
    last_run_at: (w.last_run_at as string) ?? null, tasks_generated: (w.tasks_generated as number) ?? 0,
    opportunities_generated: (w.opportunities_generated as number) ?? 0,
    template_key: (w.template_key as string) ?? null, owner_user_id: (w.owner_user_id as string) ?? null,
  }));
  const wfNameById = new Map(workflows.map((w) => [w.id, w.name]));

  let runQ = supabase.from("automation_runs").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(120);
  if (!isManager) runQ = runQ.or(`owner_user_id.eq.${userId},triggered_by.eq.${userId}`);
  const { data: runData } = await runQ;
  const runs: RunSummary[] = ((runData ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, workflow_id: r.workflow_id as string, workflow_name: wfNameById.get(r.workflow_id as string) ?? "אוטומציה",
    status: r.status as string, trigger_type: r.trigger_type as string, entity_type: (r.entity_type as string) ?? null,
    entity_label: (r.entity_label as string) ?? null, actions_prepared: (r.actions_prepared as number) ?? 0,
    actions_applied: (r.actions_applied as number) ?? 0, opportunities_generated: (r.opportunities_generated as number) ?? 0,
    blocked_reason: (r.blocked_reason as string) ?? null, error_message: (r.error_message as string) ?? null,
    created_at: r.created_at as string, owner_user_id: (r.owner_user_id as string) ?? null,
  }));

  const { data: tplData } = await supabase.from("automation_templates").select("*").eq("is_active", true).order("sort_order", { ascending: true });
  const templates: TemplateSummary[] = ((tplData ?? []) as Record<string, unknown>[]).map((t) => ({
    template_key: t.template_key as string, name: t.name as string, description: (t.description as string) ?? null,
    category: t.category as string, trigger_type: t.trigger_type as string,
    default_steps: Array.isArray(t.default_steps) ? (t.default_steps as { action_type: string; title?: string }[]) : [],
  }));

  const { data: recoData } = await supabase.from("automation_recommendations").select("*").eq("organization_id", orgId).eq("status", "open").order("impact_score", { ascending: false }).limit(20);
  const recommendations: AutomationRecoSummary[] = ((recoData ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, title: r.title as string, reason: (r.reason as string) ?? null,
    category: r.category as string, impact_score: (r.impact_score as number) ?? 50, template_key: (r.template_key as string) ?? null,
  }));

  const s = summarizeRuns(runs.map((r) => ({ status: r.status, actions_applied: r.actions_applied, opportunities_generated: r.opportunities_generated, created_at: r.created_at })));
  const analytics: AutomationAnalytics = {
    workflowsTotal: workflows.length, workflowsEnabled: workflows.filter((w) => w.is_enabled).length,
    runsTotal: runs.length, runsApplied: runs.filter((r) => r.status === "applied").length,
    pending: s.pending, completedToday: s.completedToday, failed: s.failed, blocked: s.blocked,
    tasksGenerated: s.tasks, opportunitiesGenerated: s.opportunities,
  };

  return { workflows, runs, templates, recommendations, analytics, isManager };
}

export async function getRunActions(runId: string): Promise<ActionSummary[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("automation_actions").select("*").eq("organization_id", orgId).eq("run_id", runId).order("created_at", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: a.id as string, run_id: a.run_id as string, action_type: a.action_type as string, title: a.title as string,
    description: (a.description as string) ?? null, status: a.status as string, entity_type: (a.entity_type as string) ?? null,
    applied_table: (a.applied_table as string) ?? null, applied_id: (a.applied_id as string) ?? null,
  }));
}

export async function getRunLogs(runId: string): Promise<{ level: string; message: string; created_at: string; step_action_type: string | null }[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("automation_run_logs").select("level,message,created_at,step_action_type").eq("organization_id", orgId).eq("run_id", runId).order("created_at", { ascending: true });
  return (data ?? []) as { level: string; message: string; created_at: string; step_action_type: string | null }[];
}

// ── workflow lifecycle ───────────────────────────────────────────────────────
export async function createWorkflowFromTemplate(templateKey: string): Promise<{ id: string }> {
  const { orgId, userId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול ליצור תהליך אוטומציה");
  const { data: tpl } = await supabase.from("automation_templates").select("*").eq("template_key", templateKey).maybeSingle();
  if (!tpl) throw new Error("תבנית לא נמצאה");
  const t = tpl as Record<string, unknown>;
  const { data: wf, error } = await supabase.from("automation_workflows").insert({
    organization_id: orgId, created_by: userId, name: t.name as string, description: (t.description as string) ?? null,
    category: t.category as string, trigger_type: t.trigger_type as string, template_key: templateKey,
    status: "active", is_enabled: false, require_approval: true,
  }).select("id").single();
  if (error || !wf) throw new Error(error?.message ?? "יצירת התהליך נכשלה");
  const wfId = (wf as { id: string }).id;
  await supabase.from("automation_triggers").insert({ organization_id: orgId, workflow_id: wfId, trigger_type: t.trigger_type as string });
  const steps = Array.isArray(t.default_steps) ? (t.default_steps as StepDef[]) : [];
  if (steps.length) {
    await supabase.from("automation_steps").insert(steps.map((s, i) => ({
      organization_id: orgId, workflow_id: wfId, step_order: i, action_type: s.action_type, title: s.title ?? null, config: (s.config ?? {}) as Json,
    })));
  }
  const conds = Array.isArray(t.default_conditions) ? (t.default_conditions as Record<string, unknown>[]) : [];
  if (conds.length) {
    await supabase.from("automation_conditions").insert(conds.map((c, i) => ({
      organization_id: orgId, workflow_id: wfId, condition_type: c.condition_type as string,
      operator: (c.operator as string) ?? "gte", value_number: (c.value_number as number) ?? null,
      value_text: (c.value_text as string) ?? null, sort_order: i,
    })));
  }
  return { id: wfId };
}

export async function setWorkflowEnabled(workflowId: string, enabled: boolean): Promise<void> {
  const { orgId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול לשנות הפעלת תהליך");
  await supabase.from("automation_workflows").update({ is_enabled: enabled, status: enabled ? "active" : "paused" }).eq("organization_id", orgId).eq("id", workflowId);
}

// ── run a workflow (prepare actions; pending_review) ─────────────────────────
export async function runWorkflow(workflowId: string, entity?: RunEntity, facts?: TriggerContext): Promise<{ runId: string; status: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { data: wfRow } = await supabase.from("automation_workflows").select("*").eq("organization_id", orgId).eq("id", workflowId).maybeSingle();
  if (!wfRow) throw new Error("תהליך לא נמצא");
  const wf = wfRow as Record<string, unknown>;
  const { data: stepRows } = await supabase.from("automation_steps").select("*").eq("organization_id", orgId).eq("workflow_id", workflowId).eq("is_enabled", true).order("step_order", { ascending: true });
  const steps: StepDef[] = ((stepRows ?? []) as Record<string, unknown>[]).map((s) => ({ action_type: s.action_type as string, title: (s.title as string) ?? null, config: (s.config as Record<string, unknown>) ?? {} }));
  const { data: condRows } = await supabase.from("automation_conditions").select("*").eq("organization_id", orgId).eq("workflow_id", workflowId).order("sort_order", { ascending: true });
  const conds: ConditionDef[] = ((condRows ?? []) as Record<string, unknown>[]).map((c) => ({ condition_type: c.condition_type as string, operator: c.operator as string, value_number: (c.value_number as number) ?? null, value_text: (c.value_text as string) ?? null }));

  const manualOverride = !facts || Object.keys(facts).length === 0;
  const ev = manualOverride ? { passed: true, failed: [] as string[] } : evaluateConditions(conds, facts);
  const ent: RunEntity = entity ?? {};

  // create the run shell
  const { data: runRow, error: runErr } = await supabase.from("automation_runs").insert({
    organization_id: orgId, workflow_id: workflowId, triggered_by: userId, trigger_type: (wf.trigger_type as string) ?? "manual",
    entity_type: ent.entity_type ?? null, entity_id: ent.entity_id ?? null, entity_label: ent.entity_label ?? null,
    owner_user_id: (wf.owner_user_id as string) ?? userId,
    status: ev.passed ? "pending_review" : "blocked", blocked_reason: ev.passed ? null : `תנאים לא התקיימו: ${ev.failed.join(", ")}`,
  }).select("id").single();
  if (runErr || !runRow) throw new Error(runErr?.message ?? "יצירת ריצה נכשלה");
  const runId = (runRow as { id: string }).id;

  const logs: { organization_id: string; run_id: string; workflow_id: string; level: string; message: string; step_action_type: string | null }[] = [];
  logs.push({ organization_id: orgId, run_id: runId, workflow_id: workflowId, level: "info", message: manualOverride ? "הופעל ידנית — תנאים נעקפו בפיקוח אנושי" : "תנאים נבדקו", step_action_type: null });

  if (!ev.passed) {
    logs.push({ organization_id: orgId, run_id: runId, workflow_id: workflowId, level: "warning", message: `הריצה נחסמה: ${ev.failed.join(", ")}`, step_action_type: null });
    await supabase.from("automation_run_logs").insert(logs);
    return { runId, status: "blocked" };
  }

  // prepare actions (no side effects on other modules yet)
  const prepared = buildPreparedActions(steps, ent, wf.name as string);
  if (prepared.length) {
    await supabase.from("automation_actions").insert(prepared.map((p) => ({
      organization_id: orgId, run_id: runId, workflow_id: workflowId, action_type: p.action_type,
      title: p.title, description: p.description, entity_type: p.entity_type, entity_id: p.entity_id,
      payload: p.payload as Json, status: "prepared",
    })));
    for (const p of prepared) logs.push({ organization_id: orgId, run_id: runId, workflow_id: workflowId, level: "info", message: `הוכן: ${p.title}`, step_action_type: p.action_type });
  } else {
    logs.push({ organization_id: orgId, run_id: runId, workflow_id: workflowId, level: "warning", message: "לא הוגדרו צעדים פעילים", step_action_type: null });
  }
  await supabase.from("automation_run_logs").insert(logs);
  await supabase.from("automation_runs").update({ actions_prepared: prepared.length }).eq("id", runId);
  await supabase.from("automation_workflows").update({ run_count: ((wf.run_count as number) ?? 0) + 1, last_run_at: new Date().toISOString() }).eq("id", workflowId);
  return { runId, status: "pending_review" };
}

// ── approve a run: materialize low-risk reversible artifacts ──────────────────
export async function approveRun(runId: string): Promise<{ applied: number; opportunities: number }> {
  const { orgId, userId, isManager, supabase } = await ctx();
  const { data: runRow } = await supabase.from("automation_runs").select("*").eq("organization_id", orgId).eq("id", runId).maybeSingle();
  if (!runRow) throw new Error("ריצה לא נמצאה");
  const run = runRow as Record<string, unknown>;
  if (!isManager && (run.owner_user_id as string) !== userId && (run.triggered_by as string) !== userId) throw new Error("אין הרשאה לאשר ריצה זו");
  if (run.status !== "pending_review" && run.status !== "approved") throw new Error("ניתן לאשר רק ריצה הממתינה לאישור");

  const { data: actRows } = await supabase.from("automation_actions").select("*").eq("organization_id", orgId).eq("run_id", runId).eq("status", "prepared");
  const actions = (actRows ?? []) as Record<string, unknown>[];
  let applied = 0, opportunities = 0;
  const fallbackEntityId = (run.entity_id as string) ?? (run.workflow_id as string);

  for (const a of actions) {
    const meta = actionMeta(a.action_type as string);
    let appliedTable: string | null = null; let appliedId: string | null = null; let errMsg: string | null = null;
    try {
      if (meta?.materializes === "task") {
        const { data: t } = await supabase.from("tasks").insert({ org_id: orgId, created_by: userId, title: a.title as string, description: (a.description as string) ?? null, is_automatable: true }).select("id").single();
        appliedTable = "tasks"; appliedId = (t as { id: string } | null)?.id ?? null;
      } else if (meta?.materializes === "opportunity") {
        const { data: o } = await supabase.from("opportunity_signals").insert({ org_id: orgId, entity_type: (a.entity_type as string) ?? "automation", entity_id: fallbackEntityId, title: a.title as string, description: (a.description as string) ?? null, recommended_action: "בדוק ופעל על ההזדמנות" }).select("id").single();
        appliedTable = "opportunity_signals"; appliedId = (o as { id: string } | null)?.id ?? null; opportunities++;
      } else if (meta?.materializes === "notification") {
        const target = (run.owner_user_id as string) ?? userId;
        const { data: n } = await supabase.from("notifications").insert({ org_id: orgId, user_id: target, title: a.title as string, body: (a.description as string) ?? null, level: "info", category: "system", href: "/automation" }).select("id").single();
        appliedTable = "notifications"; appliedId = (n as { id: string } | null)?.id ?? null;
      } else if (meta?.materializes === "activity") {
        const { data: e } = await supabase.from("activity_events").insert({ org_id: orgId, actor_user_id: userId, event_type: "automation_action", entity_type: (a.entity_type as string) ?? "automation", entity_id: fallbackEntityId, title: a.title as string }).select("id").single();
        appliedTable = "activity_events"; appliedId = (e as { id: string } | null)?.id ?? null;
      }
      // attention / queue actions are tracked-only: surfaced via UI + Decision Brain, enacted by a human.
      await supabase.from("automation_actions").update({ status: "applied", applied_table: appliedTable, applied_id: appliedId, applied_at: new Date().toISOString() }).eq("id", a.id as string);
      applied++;
      await supabase.from("automation_run_logs").insert({ organization_id: orgId, run_id: runId, workflow_id: run.workflow_id as string, level: "success", message: `הוחל: ${a.title as string}`, step_action_type: a.action_type as string });
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "כשל ביישום";
      await supabase.from("automation_actions").update({ status: "failed", error_message: errMsg }).eq("id", a.id as string);
      await supabase.from("automation_run_logs").insert({ organization_id: orgId, run_id: runId, workflow_id: run.workflow_id as string, level: "error", message: `כשל: ${a.title as string} — ${errMsg}`, step_action_type: a.action_type as string });
    }
  }

  await supabase.from("automation_runs").update({ status: "applied", reviewed_by: userId, reviewed_at: new Date().toISOString(), applied_at: new Date().toISOString(), actions_applied: applied, opportunities_generated: opportunities }).eq("id", runId);
  // best-effort workflow rollups
  try {
    const { data: wf } = await supabase.from("automation_workflows").select("tasks_generated,opportunities_generated").eq("id", run.workflow_id as string).maybeSingle();
    const w = (wf ?? {}) as { tasks_generated?: number; opportunities_generated?: number };
    await supabase.from("automation_workflows").update({ tasks_generated: (w.tasks_generated ?? 0) + applied, opportunities_generated: (w.opportunities_generated ?? 0) + opportunities }).eq("id", run.workflow_id as string);
  } catch { /* rollup is additive */ }
  return { applied, opportunities };
}

export async function rejectRun(runId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("automation_runs").update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", runId);
  await supabase.from("automation_run_logs").insert({ organization_id: orgId, run_id: runId, level: "warning", message: "הריצה נדחתה בפיקוח אנושי", step_action_type: null });
}

// ── reverse a run: undo materialized artifacts ───────────────────────────────
export async function reverseRun(runId: string): Promise<{ reversed: number }> {
  const { orgId, userId, isManager, supabase } = await ctx();
  const { data: runRow } = await supabase.from("automation_runs").select("*").eq("organization_id", orgId).eq("id", runId).maybeSingle();
  if (!runRow) throw new Error("ריצה לא נמצאה");
  const run = runRow as Record<string, unknown>;
  if (!isManager && (run.owner_user_id as string) !== userId && (run.triggered_by as string) !== userId) throw new Error("אין הרשאה לבטל ריצה זו");
  if (run.status !== "applied") throw new Error("ניתן לבטל רק ריצה שהוחלה");

  const { data: actRows } = await supabase.from("automation_actions").select("*").eq("organization_id", orgId).eq("run_id", runId).eq("status", "applied");
  const actions = (actRows ?? []) as Record<string, unknown>[];
  let reversed = 0;
  for (const a of actions) {
    const table = a.applied_table as string | null; const id = a.applied_id as string | null;
    try {
      if (table && id) await supabase.from(table as "tasks").delete().eq("org_id", orgId).eq("id", id);
      await supabase.from("automation_actions").update({ status: "reversed", reversed_at: new Date().toISOString() }).eq("id", a.id as string);
      reversed++;
    } catch (e) {
      await supabase.from("automation_run_logs").insert({ organization_id: orgId, run_id: runId, level: "error", message: `כשל בביטול: ${a.title as string} — ${e instanceof Error ? e.message : ""}`, step_action_type: a.action_type as string });
    }
  }
  await supabase.from("automation_runs").update({ status: "reversed", reversed_at: new Date().toISOString() }).eq("id", runId);
  await supabase.from("automation_run_logs").insert({ organization_id: orgId, run_id: runId, level: "info", message: `הריצה בוטלה — ${reversed} פעולות הוסרו`, step_action_type: null });
  return { reversed };
}

// ── analytics (standalone) ───────────────────────────────────────────────────
export async function getAutomationAnalytics(): Promise<AutomationAnalytics> {
  return (await getAutomationCommandCenter()).analytics;
}
