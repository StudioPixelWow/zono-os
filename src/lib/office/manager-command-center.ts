/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Manager / Owner Command Center · server selector (server-only). ONE
// office exceptions view. It REUSES the existing office-scoped Daily Command Center
// feed (properties / marketing / sellers / customers / publishing — coherent with
// the Morning Brief) and ADDS the pieces that feed only a manager: office follow-up
// (with agent attribution), stale deals (with owner), support escalations, billing
// state, and agent workload. Everything is composed into the PURE manager core.
// Manager/owner only, org-scoped, bounded (no N+1). Read-derived — replans each load.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getDailyCommandCenter } from "@/lib/daily/command-center";
import { getOfficeFollowUpStates } from "@/lib/follow-up/service";
import { canonicalFromSubscriptionStatus } from "@/lib/commercial/billing-state";
import {
  buildManagerCommandCenter, makeException, humanizeAging,
  type ManagerCommandCenter, type ManagerException, type ManagerExceptionType,
} from "./manager-core";

const DEAL_STALE_HOURS = 7 * 24;
const HIGH_VALUE = 3_000_000;
const OVERLOAD_OVERDUE = 5;   // an agent with ≥ N overdue follow-ups → workload flag

export interface ManagerCenterView {
  center: ManagerCommandCenter;
  agents: { id: string; name: string }[];   // active agents (reassignment picker)
  isManager: boolean;
}

async function agentNameMap(db: any, ids: string[]): Promise<Map<string, string>> {
  const clean = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (!clean.length) return map;
  const { data } = await db.from("users").select("id,full_name").in("id", clean);
  for (const u of (data ?? []) as any[]) if (u.full_name) map.set(u.id, u.full_name);
  return map;
}

/** The office command center for the current manager/owner (null if not permitted). */
export async function getManagerCommandCenter(): Promise<ManagerCenterView | null> {
  const { organization } = await getSessionContext();
  if (!organization) return null;
  const orgId = organization.id;
  const supabase = await createClient();

  // ── Role gate (server-side) — managers + owners only ──────────────────────
  let isManager = false, isOwner = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }
  if (!isManager) return null;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "owner" }); isOwner = data === true; } catch { /* not owner */ }
  const role: "manager" | "owner" = isOwner ? "owner" : "manager";

  const nowMs = Date.now();
  const exceptions: ManagerException[] = [];

  // ── Office feed (coherent with the Morning Brief) — properties / marketing /
  //    sellers / customers / publishing. Leads + deals are sourced directly below
  //    (for agent attribution), so they're EXCLUDED here to avoid double-count. ──
  let cc: Awaited<ReturnType<typeof getDailyCommandCenter>> = null;
  try { cc = await getDailyCommandCenter(); } catch { /* degrade */ }
  if (cc) {
    for (const a of cc.priorityActions) {
      const mapped = mapActionToException(a);
      if (mapped) exceptions.push(mapped);
    }
  }

  // ── Leads (office-wide) with agent attribution ────────────────────────────
  const overdueByAgent = new Map<string, number>();
  try {
    const office = await getOfficeFollowUpStates({ limit: 200 });
    const ownerIds = office.states.map((s) => s.assignedUserId).filter(Boolean) as string[];
    const names = await agentNameMap(supabase, ownerIds);
    for (const st of office.states) {
      const mapped = mapLeadStateToException(st, names, nowMs);
      if (mapped) exceptions.push(mapped);
      if ((st.state === "followup_overdue") && st.assignedUserId) overdueByAgent.set(st.assignedUserId, (overdueByAgent.get(st.assignedUserId) ?? 0) + 1);
    }
  } catch { /* degrade */ }

  // ── Deals (office-wide) — stale / high-value overdue, with owner attribution ─
  try {
    const { data: deals } = await supabase.from("deals")
      .select("id,title,stage,status,value,owner_id,updated_at,created_at").eq("org_id", orgId).limit(300);
    const rows = ((deals ?? []) as any[]).filter((d) => (d.status ?? "open") === "open" && !/clos|won|lost|cancel/i.test(d.stage ?? ""));
    const names = await agentNameMap(supabase, rows.map((d) => d.owner_id).filter(Boolean));
    for (const d of rows) {
      const t = Date.parse(d.updated_at ?? d.created_at ?? "");
      if (Number.isNaN(t)) continue;
      const hours = (nowMs - t) / 3_600_000;
      if (hours < DEAL_STALE_HOURS) continue;
      const days = Math.floor(hours / 24);
      const highValue = (d.value ?? 0) >= HIGH_VALUE;
      exceptions.push(makeException({
        id: `deal_stale:${d.id}`, type: "deal_stale", priority: highValue ? "P0" : "P1",
        title: (d.title as string)?.trim() || "עסקה", subtitle: `${days} ימים בשלב ללא פעילות`,
        reason: highValue ? "עסקה בערך גבוה תקועה — כדאי לבדוק אישית" : "עסקה תקועה ללא התקדמות",
        agentName: d.owner_id ? names.get(d.owner_id) ?? null : null, agingLabel: `${days} ימים בשלב`,
        entityType: "deal", entityId: d.id, route: `/deals/${d.id}`, cta: "פתח עסקה",
        urgency: highValue ? 82 : 55,
      }));
    }
  } catch { /* degrade */ }

  // ── Support escalations (service-role, org-scoped — platform-internal table) ─
  try {
    const svc: any = createServiceRoleClient();
    const { data: tickets } = await svc.from("support_tickets")
      .select("id,subject,status,priority,ticket_number,updated_at").eq("org_id", orgId)
      .in("status", ["open", "in_progress", "waiting_customer"]).order("updated_at", { ascending: true }).limit(20);
    const actionable = ((tickets ?? []) as any[]).filter((t) => t.status === "waiting_customer" || t.priority === "urgent").slice(0, 6);
    for (const t of actionable) {
      exceptions.push(makeException({
        id: `support:${t.id}`, type: "support_escalation", priority: "P0",
        title: t.ticket_number ? `פנייה ${t.ticket_number}` : "פניית תמיכה",
        subtitle: (t.subject as string) ?? "פנייה פתוחה", reason: t.status === "waiting_customer" ? "ממתינה לתגובת לקוח / טיפול" : "פנייה דחופה",
        agingLabel: humanizeAging(t.updated_at, nowMs), entityType: "support", entityId: t.id,
        route: "/support", cta: "פתח פנייה", urgency: 85,
      }));
    }
  } catch { /* degrade — support is platform-internal */ }

  // ── Billing (org subscription current state) ──────────────────────────────
  try {
    const svc: any = createServiceRoleClient();
    const { data: sub } = await svc.from("subscriptions").select("status,cancel_at_period_end,grace_until").eq("org_id", orgId).maybeSingle();
    if (sub) {
      const state = canonicalFromSubscriptionStatus(sub.status, { cancelAtPeriodEnd: sub.cancel_at_period_end === true });
      const billing = billingException(state);
      if (billing) exceptions.push(billing);
    }
  } catch { /* degrade */ }

  // ── Agent workload (operational only — never a leaderboard) ───────────────
  if (overdueByAgent.size) {
    const names = await agentNameMap(supabase, [...overdueByAgent.keys()]);
    for (const [agentId, count] of overdueByAgent) {
      if (count < OVERLOAD_OVERDUE) continue;
      exceptions.push(makeException({
        id: `overload:${agentId}`, type: "agent_overloaded", priority: "P2",
        title: names.get(agentId) ?? "סוכן", subtitle: `${count} מעקבים באיחור`,
        reason: "עומס מעקבים — ייתכן שעדיף לאזן משימות", entityType: "agent", entityId: agentId,
        route: "/team", cta: "צפייה בצוות", urgency: 20,
      }));
    }
  }

  const center = buildManagerCommandCenter({ exceptions, role, date: new Date(nowMs).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) });

  // Active agents for the reassignment picker.
  let agents: { id: string; name: string }[] = [];
  try {
    const { data } = await supabase.from("users").select("id,full_name,status").eq("org_id", orgId).eq("status", "active").limit(100);
    agents = ((data ?? []) as any[]).filter((u) => u.full_name).map((u) => ({ id: u.id, name: u.full_name }));
  } catch { /* ignore */ }

  return { center, agents, isManager: true };
}

// ── Mapping helpers ──────────────────────────────────────────────────────────
function mapActionToException(a: { id: string; kind: string; priority: string; title: string; reason: string; href: string; cta: string; entity?: { type: string; id: string } }): ManagerException | null {
  // Leads + deals are sourced directly (attribution) → skip here.
  if (a.kind === "lead_callback" || a.kind === "lead_unassigned" || a.kind === "deal_stuck") return null;
  // Personal / non-exception kinds.
  if (a.kind === "task_today" || a.kind === "task_overdue" || a.kind === "publish_today") return null;

  let type: ManagerExceptionType | null = null;
  if (a.kind === "property_unmarketed") type = "property_not_marketed";
  else if (a.kind === "property_attention") type = "property_attention";
  else if (a.kind === "seller_callback") type = "seller_callback";
  else if (a.kind === "seller_strategy") type = "seller_strategy";
  else if (a.kind === "customer_reply" || a.kind === "price_drop_response") type = "buyer_action_required";
  else if (a.kind === "publish_failed") type = "publish_failed";
  else if (a.kind === "marketing_attention") {
    type = a.id.startsWith("mkt-plan:attention") ? "marketing_plan_failed"
      : a.id.startsWith("mkt-plan:drafts") ? "marketing_plan_waiting_approval"
      : "property_attention";
  } else if (a.kind === "price_drop") return null; // opportunity, not an office exception
  if (!type) return null;

  const prepifiable = type === "marketing_plan_waiting_approval" || type === "property_not_marketed";
  return makeException({
    id: `${a.kind}:${a.entity?.id ?? a.id}`, type, priority: a.priority as ManagerException["priority"],
    title: a.title, subtitle: a.reason, reason: a.reason,
    entityType: a.entity?.type ?? null, entityId: a.entity?.id ?? null,
    route: a.href, cta: a.cta, canPrepare: prepifiable,
    requiresConfirmation: type === "marketing_plan_waiting_approval",
    urgency: a.priority === "P0" ? 78 : 52,
  });
}

interface FollowUpLike { leadId: string; leadName: string | null; state: string; urgency: number; reason: string; hot: boolean; assignedUserId: string | null; lastMeaningfulContactAt: string | null }
function mapLeadStateToException(st: FollowUpLike, names: Map<string, string>, nowMs: number): ManagerException | null {
  let type: ManagerExceptionType | null = null;
  let priority: ManagerException["priority"] | undefined;
  if (st.state === "unassigned") { type = "lead_unassigned"; priority = "P1"; }
  else if (st.state === "followup_overdue") { type = "followup_overdue"; priority = st.urgency >= 75 ? "P0" : "P1"; }
  else if (st.state === "new_waiting") { type = st.hot ? "hot_lead_no_action" : "lead_sla_breach"; priority = st.hot || st.urgency >= 75 ? "P0" : "P1"; }
  else if (st.state === "needs_action") { type = st.hot ? "hot_lead_no_action" : "followup_overdue"; priority = st.hot ? "P0" : "P1"; }
  if (!type) return null;
  return makeException({
    id: `${type}:${st.leadId}`, type, priority,
    title: (st.leadName ?? "").trim() || "ליד", subtitle: st.reason, reason: st.reason,
    agentName: st.assignedUserId ? names.get(st.assignedUserId) ?? null : null,
    agingLabel: humanizeAging(st.lastMeaningfulContactAt, nowMs),
    entityType: "lead", entityId: st.leadId, route: `/leads/${st.leadId}`,
    cta: st.state === "unassigned" ? "שיוך" : "פתח ליד", urgency: st.urgency,
  });
}

function billingException(state: string): ManagerException | null {
  if (state === "payment_failed") return makeException({ id: "billing:failed", type: "billing_action_required", priority: "P0", title: "תשלום נכשל", subtitle: "המנוי מושהה עקב כשל בתשלום", reason: "נדרש טיפול כדי לשמור על גישה מלאה", entityType: "billing", entityId: "subscription", route: "/settings/plan", cta: "לניהול המנוי", urgency: 88 });
  if (state === "grace") return makeException({ id: "billing:grace", type: "billing_action_required", priority: "P0", title: "המנוי בתקופת חסד", subtitle: "התשלום לא הושלם", reason: "יש להסדיר תשלום לפני סיום תקופת החסד", entityType: "billing", entityId: "subscription", route: "/settings/plan", cta: "לניהול המנוי", urgency: 84 });
  if (state === "payment_due") return makeException({ id: "billing:due", type: "billing_action_required", priority: "P1", title: "תשלום ממתין", subtitle: "יש חיוב ממתין להסדרה", reason: "כדאי להשלים את התשלום", entityType: "billing", entityId: "subscription", route: "/settings/plan", cta: "לניהול המנוי", urgency: 50 });
  if (state === "cancel_pending") return makeException({ id: "billing:cancel", type: "billing_action_required", priority: "P1", title: "המנוי מתוכנן לביטול", subtitle: "המנוי יבוטל בסוף התקופה", reason: "אם לא רציתם לבטל — כדאי לבדוק", entityType: "billing", entityId: "subscription", route: "/settings/plan", cta: "לניהול המנוי", urgency: 48 });
  return null;
}

/** Deterministic ZI answer about the office (facts from the same DTO; never invented). */
export async function summarizeManagerForZi(): Promise<string | null> {
  const v = await getManagerCommandCenter();
  if (!v) return null;
  const c = v.center;
  if (c.quiet) return "המשרד בשליטה ✓ — אין חריגים שדורשים אותך כרגע.";
  const lines: string[] = [`🏢 ${c.headline}`];
  [...c.critical, ...c.attention].slice(0, 6).forEach((e, i) => {
    const who = e.agentName ? ` · סוכן: ${e.agentName}` : "";
    lines.push(`${i + 1}. ${e.title} — ${e.subtitle}${e.agingLabel ? ` (${e.agingLabel})` : ""}${who}`);
  });
  if (c.nextDecision) lines.push(`➡️ הייתי מתחיל מ: ${c.nextDecision.title} — ${c.nextDecision.subtitle}`);
  lines.push("לתמונה המלאה: /office");
  return lines.join("\n");
}
