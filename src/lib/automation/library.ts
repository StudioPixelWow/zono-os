// ============================================================================
// ZONO — Automation Library OS · Service (server-only)
// ----------------------------------------------------------------------------
// Reads the system template library (automation_templates where risk_level is
// set), reports enable status per org, recommends which templates to enable
// from org data, and enables/disables/tests templates by reusing the existing
// human-supervised engine (createWorkflowFromTemplate + runWorkflow). No
// autonomous external communication; nothing is sent.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { createWorkflowFromTemplate, setWorkflowEnabled, runWorkflow } from "./service";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}

// Client-safe category/risk metadata lives in engine.ts; re-export for server callers.
import { LIBRARY_CATEGORIES, libraryCategoryLabel, RISK_LABELS } from "./engine";
export { LIBRARY_CATEGORIES, libraryCategoryLabel, RISK_LABELS };

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface LibraryTemplate {
  template_key: string; category: string; subcategory: string | null; title: string;
  description: string | null; business_goal: string | null; trigger_type: string;
  actions: string[]; risk_level: string; default_enabled: boolean; required_role: string;
  related_modules: string[]; decision_brain_signal_type: string | null; expected_impact: string | null;
  expected_revenue_impact: number; expected_time_saved_minutes: number; priority: number;
  enabled: boolean; runs: number; failed: number; lastRunAt: string | null;
}
export interface LibraryCategoryCount { category: string; label: string; total: number; enabled: number; }
export interface LibrarySummary {
  total: number; enabled: number; safe: number; reviewRequired: number; managerApproval: number;
  byCategory: LibraryCategoryCount[]; isManager: boolean;
}

export interface LibraryFilters { category?: string; risk?: string; status?: "enabled" | "disabled"; search?: string; }

// ── read library ──────────────────────────────────────────────────────────────
export async function getAutomationLibrary(filters?: LibraryFilters): Promise<{ templates: LibraryTemplate[]; summary: LibrarySummary }> {
  const { orgId, isManager, supabase } = await ctx();

  let q = supabase.from("automation_templates").select("*").not("risk_level", "is", null).order("category", { ascending: true }).order("sort_order", { ascending: true });
  if (filters?.category) q = q.eq("category", filters.category);
  if (filters?.risk) q = q.eq("risk_level", filters.risk);
  const { data: tplData } = await q;
  const templates0 = (tplData ?? []) as Record<string, unknown>[];

  // workflows already created from library templates (enabled status + run/fail counts)
  const { data: wfData } = await supabase.from("automation_workflows").select("id,template_key,is_enabled,run_count,last_run_at").eq("organization_id", orgId).not("template_key", "is", null);
  const wfByKey = new Map<string, { enabled: boolean; runs: number; lastRunAt: string | null }>();
  const keyByWfId = new Map<string, string>();
  for (const w of (wfData ?? []) as { id: string; template_key: string; is_enabled: boolean; run_count: number; last_run_at: string | null }[]) {
    keyByWfId.set(w.id, w.template_key);
    const prev = wfByKey.get(w.template_key);
    wfByKey.set(w.template_key, { enabled: (prev?.enabled || w.is_enabled) ?? false, runs: (prev?.runs ?? 0) + (w.run_count ?? 0), lastRunAt: w.last_run_at ?? prev?.lastRunAt ?? null });
  }
  // failed/blocked run counts attributed back to the template
  const { data: failData } = await supabase.from("automation_runs").select("workflow_id,status").eq("organization_id", orgId).in("status", ["failed", "blocked"]);
  const failByKey = new Map<string, number>();
  for (const r of (failData ?? []) as { workflow_id: string; status: string }[]) {
    const k = keyByWfId.get(r.workflow_id); if (k) failByKey.set(k, (failByKey.get(k) ?? 0) + 1);
  }

  let templates: LibraryTemplate[] = templates0.map((t) => {
    const key = t.template_key as string;
    const wf = wfByKey.get(key);
    const actions = Array.isArray(t.actions) ? (t.actions as { action_type: string }[]).map((a) => a.action_type) : [];
    return {
      template_key: key, category: t.category as string, subcategory: (t.subcategory as string) ?? null,
      title: (t.title_hebrew as string) ?? (t.name as string), description: (t.description_hebrew as string) ?? null,
      business_goal: (t.business_goal_hebrew as string) ?? null, trigger_type: t.trigger_type as string,
      actions, risk_level: (t.risk_level as string) ?? "safe", default_enabled: Boolean(t.default_enabled),
      required_role: (t.required_role as string) ?? "agent", related_modules: (t.related_modules as string[]) ?? [],
      decision_brain_signal_type: (t.decision_brain_signal_type as string) ?? null, expected_impact: (t.expected_impact as string) ?? null,
      expected_revenue_impact: (t.expected_revenue_impact as number) ?? 0, expected_time_saved_minutes: (t.expected_time_saved_minutes as number) ?? 0,
      priority: (t.priority as number) ?? 3, enabled: wf?.enabled ?? false, runs: wf?.runs ?? 0, failed: failByKey.get(key) ?? 0, lastRunAt: wf?.lastRunAt ?? null,
    };
  });

  if (filters?.status === "enabled") templates = templates.filter((t) => t.enabled);
  if (filters?.status === "disabled") templates = templates.filter((t) => !t.enabled);
  if (filters?.search) { const s = filters.search.trim(); if (s) templates = templates.filter((t) => t.title.includes(s) || (t.subcategory ?? "").toLowerCase().includes(s.toLowerCase())); }

  // summary computed over the full library (ignoring status/search filters)
  const { data: allData } = await supabase.from("automation_templates").select("category,risk_level,template_key").not("risk_level", "is", null);
  const all = (allData ?? []) as { category: string; risk_level: string; template_key: string }[];
  const byCat = new Map<string, { total: number; enabled: number }>();
  let safe = 0, review = 0, manager = 0, enabledCount = 0;
  for (const a of all) {
    const c = byCat.get(a.category) ?? { total: 0, enabled: 0 };
    c.total++;
    const en = wfByKey.get(a.template_key)?.enabled ?? false;
    if (en) { c.enabled++; enabledCount++; }
    byCat.set(a.category, c);
    if (a.risk_level === "safe") safe++; else if (a.risk_level === "review_required") review++; else if (a.risk_level === "manager_approval_required") manager++;
  }
  const summary: LibrarySummary = {
    total: all.length, enabled: enabledCount, safe, reviewRequired: review, managerApproval: manager,
    byCategory: LIBRARY_CATEGORIES.map((c) => ({ category: c.key, label: c.label, total: byCat.get(c.key)?.total ?? 0, enabled: byCat.get(c.key)?.enabled ?? 0 })),
    isManager,
  };
  return { templates, summary };
}

// ── recommendation engine ─────────────────────────────────────────────────────
export interface LibraryRecommendation { template_key: string; title: string; category: string; reason: string; impact: string; }

async function headCount(supabase: Awaited<ReturnType<typeof createClient>>, table: string, col: string, orgId: string): Promise<number> {
  try { const { count } = await supabase.from(table as "leads").select("id", { count: "exact", head: true }).eq(col, orgId); return count ?? 0; } catch { return 0; }
}

export async function recommendAutomationTemplatesForOrg(): Promise<LibraryRecommendation[]> {
  const { orgId, supabase } = await ctx();
  const [leads, buyers, sellers, properties, deals, portals, officeLeads, agentLeads, social, txns] = await Promise.all([
    headCount(supabase, "leads", "org_id", orgId),
    headCount(supabase, "buyers", "org_id", orgId),
    headCount(supabase, "sellers", "org_id", orgId),
    headCount(supabase, "properties", "org_id", orgId),
    headCount(supabase, "deals", "org_id", orgId),
    headCount(supabase, "client_portals", "organization_id", orgId),
    headCount(supabase, "office_website_leads", "organization_id", orgId),
    headCount(supabase, "agent_website_leads", "organization_id", orgId),
    headCount(supabase, "social_leads", "org_id", orgId),
    headCount(supabase, "property_transactions", "organization_id", orgId),
  ]);

  // pick categories with real data
  const wanted: { category: string; reason: string }[] = [];
  if (leads > 0) wanted.push({ category: "lead", reason: `${leads} לידים פעילים — כדאי אוטומציות מעקב ושיוך` });
  if (buyers > 0) wanted.push({ category: "buyer", reason: `${buyers} קונים — אוטומציות חבילות והמלצות` });
  if (sellers > 0) wanted.push({ category: "seller", reason: `${sellers} מוכרים — אוטומציות תמחור ומסמכים` });
  if (properties > 0) wanted.push({ category: "property", reason: `${properties} נכסים — אוטומציות פעילות והפצה` });
  if (deals > 0) wanted.push({ category: "deal", reason: `${deals} עסקאות — אוטומציות סגירה וסיכון` });
  if (portals > 0) wanted.push({ category: "portal", reason: `שימוש בפורטלים — אוטומציות מעקב צפייה` });
  if (officeLeads + agentLeads > 0) wanted.push({ category: "website", reason: `לידים מאתרים — אוטומציות ניתוב` });
  if (social > 0) wanted.push({ category: "social", reason: `לידים חברתיים — אוטומציות הסמכה והמרה` });
  if (txns > 0) wanted.push({ category: "transaction", reason: `כיסוי עסקאות — אוטומציות בדיקת תמחור` });
  if (wanted.length === 0) wanted.push({ category: "lead", reason: "התחל מאוטומציות לידים בטוחות" });

  // already-enabled keys to skip
  const { data: wfData } = await supabase.from("automation_workflows").select("template_key").eq("organization_id", orgId).not("template_key", "is", null);
  const enabledKeys = new Set((wfData ?? []).map((w) => (w as { template_key: string }).template_key));

  const recs: LibraryRecommendation[] = [];
  for (const w of wanted) {
    const { data } = await supabase.from("automation_templates").select("template_key,title_hebrew,category,expected_impact")
      .eq("category", w.category).eq("risk_level", "safe").eq("default_enabled", true).order("priority", { ascending: false }).limit(3);
    for (const t of (data ?? []) as { template_key: string; title_hebrew: string; category: string; expected_impact: string | null }[]) {
      if (enabledKeys.has(t.template_key)) continue;
      recs.push({ template_key: t.template_key, title: t.title_hebrew, category: t.category, reason: w.reason, impact: t.expected_impact ?? "medium" });
      if (recs.length >= 18) break;
    }
    if (recs.length >= 18) break;
  }
  return recs;
}

// ── enable / disable / test / duplicate ──────────────────────────────────────
export async function enableTemplate(templateKey: string): Promise<{ workflowId: string }> {
  const { isManager } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול להפעיל תבנית");
  const wf = await createWorkflowFromTemplate(templateKey);
  await setWorkflowEnabled(wf.id, true);
  return { workflowId: wf.id };
}

export async function disableTemplate(templateKey: string): Promise<{ disabled: number }> {
  const { orgId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול להשבית תבנית");
  const { data } = await supabase.from("automation_workflows").select("id").eq("organization_id", orgId).eq("template_key", templateKey).eq("is_enabled", true);
  const ids = (data ?? []).map((w) => (w as { id: string }).id);
  for (const id of ids) await setWorkflowEnabled(id, false);
  return { disabled: ids.length };
}

export async function runTemplateTest(templateKey: string): Promise<{ runId: string; status: string }> {
  const { orgId, supabase } = await ctx();
  const { data: existing } = await supabase.from("automation_workflows").select("id").eq("organization_id", orgId).eq("template_key", templateKey).limit(1).maybeSingle();
  let wfId = (existing as { id: string } | null)?.id ?? null;
  if (!wfId) { const wf = await createWorkflowFromTemplate(templateKey); wfId = wf.id; }
  return runWorkflow(wfId, { entity_label: "בדיקת תבנית" });
}

export async function duplicateTemplate(templateKey: string): Promise<{ workflowId: string }> {
  const { isManager } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול לשכפל תבנית");
  const wf = await createWorkflowFromTemplate(templateKey); // creates an editable working copy (paused)
  return { workflowId: wf.id };
}
