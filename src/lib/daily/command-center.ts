// ============================================================================
// ZONO — "על הבוקר" Daily Command Center (server-only). ONE coordinated,
// bounded aggregation that answers the 10 morning questions from REAL,
// org-scoped, role-aware state. Reuses the canonical selectors (property
// coverage, publishing/Today, tasks, activity, leads) — no duplicate business
// logic, no fabricated data, no N+1 explosion. Priority is DETERMINISTIC
// (priority.ts); ZI may only reword these facts, never invent them.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPropertyMarketingCoverage, type PropertyCoverage } from "@/lib/distribution/property-coverage";
import { getPublishingControlData } from "@/lib/distribution/publishing-control-data";
import { listTodayTasks } from "@/lib/home/home-service";
import { activityEventRepository } from "@/lib/activity/repository";
import {
  buildHeroLine, humanizeAge, hoursSince, rankDailyActions,
  type DailyAction, type DailyCommandCenter, type DailyLeadRow, type DailyPropertyRow,
  type DailyRole, type OvernightChange, type CompletedItem, type DailyCalendarItem,
} from "./priority";
import { getOfficeFollowUpStates } from "@/lib/follow-up/service";
import type { FollowUpState } from "@/lib/follow-up/state";

const OPEN_LEAD_STAGES = ["new", "contacted", "qualified", "nurturing"];
const israelDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) : null;

const COVERAGE_STATUS_LABEL: Record<string, string> = {
  marketing_now: "משווק כעת", scheduled: "מתוזמן", no_future: "אין פרסום נוסף",
  attention: "דורש טיפול", never_published: "לא פורסם עדיין",
};

/**
 * The authoritative morning brief for the current session. Returns null when
 * there is no active org (unauthenticated / mid-onboarding). Resilient: any
 * single source failing degrades that section, never the whole brief.
 */
export async function getDailyCommandCenter(): Promise<DailyCommandCenter | null> {
  const { user, profile, organization } = await getSessionContext();
  if (!organization || !profile) return null;

  const orgId = organization.id;
  const userId = user?.id ?? null;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const sinceIso = new Date(nowMs - 24 * 3_600_000).toISOString();
  const todayIsrael = israelDay(nowIso);
  const supabase = await createClient();

  // ── Role (org RLS-mirrored ranks) ──────────────────────────────────────────
  let isManager = false, isOwner = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "owner" }); isOwner = data === true; } catch { /* not owner */ }
  const role: DailyRole = isOwner ? "owner" : isManager ? "manager" : "agent";

  // ── Bounded, parallel, resilient fetch of every source ─────────────────────
  const dealsQuery = (() => {
    let q = supabase.from("deals").select("id,title,stage,status,value,updated_at,created_at,owner_id").eq("org_id", orgId);
    if (!isManager && userId) q = q.eq("owner_id", userId);
    return q.limit(200);
  })();

  const [leadsR, coverageR, publishingR, tasksR, eventsR, dealsR] = await Promise.allSettled([
    getOfficeFollowUpStates({ limit: 200 }),
    getPropertyMarketingCoverage(),
    getPublishingControlData(),
    listTodayTasks(10),
    activityEventRepository.listForOrgSince(sinceIso, 300),
    dealsQuery,
  ]);

  const followUp = leadsR.status === "fulfilled" ? leadsR.value : { isManager, states: [] as FollowUpState[] };
  const coverage = coverageR.status === "fulfilled" ? coverageR.value : null;
  const publishing = publishingR.status === "fulfilled" ? publishingR.value : null;
  const tasks = tasksR.status === "fulfilled" ? tasksR.value : [];
  const events = eventsR.status === "fulfilled" ? eventsR.value : [];
  const deals = dealsR.status === "fulfilled" ? ((dealsR.value.data ?? []) as unknown as Array<{ id: string; title: string | null; stage: string; status: string | null; value: number | null; updated_at: string | null; created_at: string | null }>) : [];

  const actions: DailyAction[] = [];

  // ── LEADS → the CANONICAL follow-up state (no duplicate prioritization) ─────
  // The morning "who must I call back" list IS the follow-up engine's output;
  // command-center renders getOfficeFollowUpStates() and never re-derives urgency.
  const leadRowsOut: DailyLeadRow[] = [];
  const LEAD_ATTENTION = new Set(["new_waiting", "followup_overdue", "unassigned", "needs_action"]);
  for (const st of followUp.states) {
    if (!LEAD_ATTENTION.has(st.state)) continue;
    const priority: DailyAction["priority"] = st.urgency >= 75 ? "P0" : st.urgency >= 45 ? "P1" : "P2";
    const isUnassigned = st.state === "unassigned";
    const icon = st.state === "followup_overdue" ? "AlertTriangle"
      : isUnassigned ? "UserPlus"
      : st.state === "new_waiting" ? "PhoneCall"
      : st.hot ? "Flame" : "Flag";
    const name = (st.leadName ?? "").trim() || "ליד";
    const href = `/leads/${st.leadId}`;
    actions.push({
      id: `lead:${st.leadId}`, kind: isUnassigned ? "lead_unassigned" : "lead_callback",
      priority, title: name, reason: st.reason, href,
      cta: isUnassigned ? "שיוך וטיפול" : "חזרה לליד", icon, urgency: st.urgency,
      entity: { type: "lead", id: st.leadId },
    });
    leadRowsOut.push({
      id: st.leadId, name, source: st.source, stage: st.stage,
      temperature: st.hot ? "hot" : "warm", waitingSince: st.lastMeaningfulContactAt,
      unassigned: !st.assignedUserId, phone: null, href, reason: st.reason,
    });
  }

  // ── PROPERTY marketing health ──────────────────────────────────────────────
  const propertyRowsOut: DailyPropertyRow[] = [];
  const covProps: PropertyCoverage[] = coverage?.properties ?? [];
  for (const p of covProps.slice(0, 12)) {
    let cta = "", href = "/distribution", priority: DailyAction["priority"] | null = null, reason = "";
    if (p.status === "attention") { priority = "P1"; cta = "טפל בפרסום"; href = "/distribution/daily"; reason = "פרסום דורש טיפול"; }
    else if (p.status === "never_published") { priority = "P1"; cta = "התחל קמפיין"; href = `/distribution/campaign-wizard?property=${p.propertyId}`; reason = "לא פורסם עדיין"; }
    else if (p.status === "no_future") { priority = "P2"; cta = "צור פרסום נוסף"; href = `/distribution/campaign-wizard?property=${p.propertyId}`; reason = "אין פרסום נוסף מתוזמן"; }
    if (!priority) continue;
    actions.push({ id: `prop:${p.propertyId}`, kind: p.status === "attention" ? "property_attention" : "property_unmarketed", priority, title: p.title, reason, href, cta, icon: "Home", urgency: p.status === "attention" ? 70 : p.status === "never_published" ? 40 : 20, entity: { type: "property", id: p.propertyId } });
    propertyRowsOut.push({ propertyId: p.propertyId, title: p.title, city: p.city, thumbnailUrl: (p as unknown as { thumbnailUrl?: string | null }).thumbnailUrl ?? null, status: p.status, statusLabel: COVERAGE_STATUS_LABEL[p.status] ?? p.status, lastPublishedAt: p.lastPublishedAt, nextScheduledAt: p.nextScheduledAt, nextOverdue: p.nextOverdue, cta, href });
  }

  // ── TODAY's Facebook marketing (canonical publishing system) ───────────────
  const failCount = publishing ? (publishing.failed.length + publishing.reconciliation.length) : 0;
  const queued = publishing?.queued ?? [];
  const plannedToday = queued.filter((q) => israelDay((q as unknown as { scheduledAt?: string | null }).scheduledAt) === todayIsrael).length;
  const publishedToday = publishing?.publishedToday.length ?? 0;
  const nextPublishAt = queued
    .map((q) => (q as unknown as { scheduledAt?: string | null }).scheduledAt)
    .filter((s): s is string => !!s)
    .sort()[0] ?? null;
  if (failCount > 0) actions.push({ id: "publish:failed", kind: "publish_failed", priority: "P0", title: "פרסום נכשל", reason: `${failCount} פרסומים דורשים טיפול`, href: "/distribution/daily", cta: "לטיפול", icon: "AlertTriangle", urgency: 95 });
  if (plannedToday > 0) actions.push({ id: "publish:today", kind: "publish_today", priority: "P1", title: "פרסומים מוכנים להיום", reason: `${plannedToday} פרסומים מתוזמנים להיום`, href: "/distribution/daily", cta: "פרסום עכשיו", icon: "Send", urgency: 60 });

  // ── TASKS / today ──────────────────────────────────────────────────────────
  const calendar: DailyCalendarItem[] = [];
  let overdueTasks = 0, tasksDoneToday = 0;
  const doneRe = /done|completed|closed|בוצע|הושלם/i;
  for (const t of tasks) {
    if (t.status && doneRe.test(t.status)) { if (israelDay(t.dueAt) === todayIsrael) tasksDoneToday++; continue; }
    const overdue = !!t.dueAt && new Date(t.dueAt).getTime() < nowMs;
    if (overdue) { overdueTasks++; actions.push({ id: `task:${t.id}`, kind: "task_overdue", priority: "P1", title: t.title, reason: `משימה באיחור ${humanizeAge(t.dueAt, nowMs)}`, href: "/today", cta: "לטיפול", icon: "Clock", urgency: 62, entity: { type: "task", id: t.id } }); }
    else actions.push({ id: `task:${t.id}`, kind: "task_today", priority: "P2", title: t.title, reason: "משימה להיום", href: "/today", cta: "לצפייה", icon: "CheckSquare", urgency: 15, entity: { type: "task", id: t.id } });
    calendar.push({ id: t.id, title: t.title, at: t.dueAt, kind: "task", href: "/today" });
  }
  calendar.sort((a, b) => (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity));

  // ── DEAL exceptions — every ACTIVE deal that needs attention. Reuses the same
  //    role-scoped deals fetch (agent = own via owner_id filter, manager = office).
  //    Stale = open, non-terminal, untouched ≥ 7 days. Surfaced as ranked actions
  //    (NOT a new dashboard block); high-value stale deals escalate to P0. ──────
  const DEAL_STALE_HOURS = 7 * 24;
  const dealClosedRe = /clos|won|lost|cancel/i;
  let staleDeals = 0;
  for (const d of deals) {
    if (d.status && d.status !== "open") continue;
    if (dealClosedRe.test(d.stage ?? "")) continue;
    const h = hoursSince(d.updated_at ?? d.created_at, nowMs);
    if (!Number.isFinite(h) || h < DEAL_STALE_HOURS) continue;
    staleDeals++;
    const days = Math.floor(h / 24);
    const highValue = (d.value ?? 0) >= 3_000_000;
    actions.push({
      id: `deal:${d.id}`, kind: "deal_stuck", priority: highValue ? "P0" : "P1",
      title: d.title?.trim() || "עסקה", reason: `עסקה תקועה ${days} ימים ללא פעילות`,
      href: `/deals/${d.id}`, cta: "טפל בעסקה", icon: "Briefcase",
      urgency: highValue ? 80 : 58, entity: { type: "deal", id: d.id },
    });
  }

  // ── CUSTOMER WhatsApp replies needing attention (agent = own contacts, manager
  //    = office). Reuses the linked inbound conversations; surfaced as ranked
  //    actions, not a new brief block. ──
  try {
    let wq = supabase.from("whatsapp_conversations")
      .select("id,contact_name,last_message,lead_id,buyer_id,assigned_agent_id")
      .eq("organization_id", orgId).eq("unread", true).not("detected_role", "is", null)
      .order("last_message_at", { ascending: false }).limit(20);
    if (!isManager && userId) wq = wq.eq("assigned_agent_id", userId);
    const { data: waRows } = await wq;
    for (const c of (waRows ?? []) as Array<{ id: string; contact_name: string | null; last_message: string | null; lead_id: string | null; buyer_id: string | null }>) {
      const entId = c.lead_id ?? c.buyer_id ?? c.id;
      const href = c.lead_id ? `/leads/${c.lead_id}` : c.buyer_id ? `/buyers/${c.buyer_id}` : "/whatsapp";
      actions.push({
        id: `wareply:${c.id}`, kind: "customer_reply", priority: "P1",
        title: c.contact_name ?? "לקוח", reason: c.last_message ? `ענה בוואטסאפ: "${c.last_message.slice(0, 50)}"` : "ענה בוואטסאפ — ממתין לתשובה",
        href, cta: "השב", icon: "MessageCircle", urgency: 66, entity: { type: c.lead_id ? "lead" : "buyer", id: entId },
      });
    }
  } catch { /* best-effort */ }

  // ── PRICE-DROP opportunities + responses (Slice 4). Sourced from the canonical
  //    property.price_dropped outcome events (real eligible/sent counts) + recent
  //    customer responses on dropped properties. Bounded; surfaced as ranked
  //    actions, not a new analytics card. ──
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: dropEvts } = await sb.from("domain_events")
      .select("entity_id,payload,occurred_at").eq("organization_id", orgId)
      .eq("event_type", "property.price_dropped").gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: false }).limit(20);
    const seenProp = new Set<string>();
    for (const e of (dropEvts ?? []) as Array<{ entity_id: string; payload: Record<string, unknown> | null }>) {
      if (seenProp.has(e.entity_id)) continue;
      seenProp.add(e.entity_id);
      const p = e.payload ?? {};
      const eligible = Number(p.eligible ?? 0);
      if (eligible <= 0) continue;
      actions.push({
        id: `pricedrop:${e.entity_id}`, kind: "price_drop", priority: eligible >= 3 ? "P1" : "P2",
        title: (p.title as string)?.trim() || "נכס", reason: `המחיר ירד — ${eligible} מתעניינים רלוונטיים${Number(p.sent ?? 0) > 0 ? `, ${Number(p.sent)} עודכנו` : ""}`,
        href: `/properties/${e.entity_id}`, cta: "צפייה בנכס", icon: "TrendingDown",
        urgency: eligible >= 3 ? 62 : 44, entity: { type: "property", id: e.entity_id },
      });
    }
  } catch { /* best-effort */ }
  // Customers who RESPONDED after a price drop (interested / viewing) — one ranked
  // opportunity action when present.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: resp } = await sb.from("customer_property_recommendations")
      .select("contact_id,property_id,price_at_send,status,responded_at").eq("org_id", orgId)
      .in("status", ["interested", "viewing_requested"]).gte("responded_at", sinceIso)
      .not("price_at_send", "is", null).limit(50);
    const respRows = (resp ?? []) as Array<{ contact_id: string; property_id: string; price_at_send: number | null }>;
    if (respRows.length) {
      const pids = [...new Set(respRows.map((r) => r.property_id))];
      const { data: pr } = await sb.from("properties").select("id,price").in("id", pids).eq("org_id", orgId);
      const priceById = new Map(((pr ?? []) as Array<{ id: string; price: number | null }>).map((x) => [x.id, Number(x.price)]));
      const afterDrop = respRows.filter((r) => { const cur = priceById.get(r.property_id); return cur != null && r.price_at_send != null && cur < r.price_at_send; });
      const responders = new Set(afterDrop.map((r) => r.contact_id)).size;
      if (responders > 0) {
        actions.push({
          id: "pricedrop:responses", kind: "price_drop_response", priority: "P1",
          title: "תגובות לעדכון מחיר", reason: `${responders} לקוחות הגיבו לעדכון מחיר — כדאי לחזור אליהם`,
          href: "/buyers", cta: "חזרה ללקוחות", icon: "MessageCircle", urgency: 70,
        });
      }
    }
  } catch { /* best-effort */ }

  // ── SELLER actions (Seller Lifecycle). A property owner who asked (via WhatsApp)
  //    for a call or to discuss price is surfaced as a ranked action — cheap, from
  //    the tasks the inbound linkage already created. Role-scoped. ──
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let tq = sb.from("tasks").select("id,title,seller_id,property_id,intelligence_source,assignee_id,status")
      .eq("org_id", orgId).like("intelligence_source", "wa:%:seller:%").in("status", ["todo", "in_progress", "blocked"])
      .order("created_at", { ascending: false }).limit(15);
    if (!isManager && userId) tq = tq.eq("assignee_id", userId);
    const { data: stasks } = await tq;
    const rows = (stasks ?? []) as Array<{ id: string; property_id: string | null; intelligence_source: string | null }>;
    if (rows.length) {
      const pids = [...new Set(rows.map((r) => r.property_id).filter(Boolean))] as string[];
      const titleById = new Map<string, string>();
      if (pids.length) {
        const { data: pr } = await sb.from("properties").select("id,title").in("id", pids).eq("org_id", orgId);
        for (const p of (pr ?? []) as Array<{ id: string; title: string | null }>) if (p.title) titleById.set(p.id, p.title);
      }
      for (const t of rows) {
        const isPrice = (t.intelligence_source ?? "").includes(":price_discussion:");
        const propTitle = t.property_id ? titleById.get(t.property_id) ?? null : null;
        actions.push({
          id: `seller:${t.id}`, kind: isPrice ? "seller_strategy" : "seller_callback", priority: "P1",
          title: propTitle ? `בעל הנכס · ${propTitle}` : "בעל הנכס",
          reason: isPrice ? "בעל הנכס מבקש לדון במחיר / אסטרטגיה" : "בעל הנכס מבקש שיחה",
          href: t.property_id ? `/properties/${t.property_id}` : "/sellers",
          cta: "טיפול", icon: "MessageCircle", urgency: isPrice ? 72 : 68,
          entity: t.property_id ? { type: "property", id: t.property_id } : undefined,
        });
      }
    }
  } catch { /* best-effort */ }

  // ── MARKETING AUTOPILOT — properties that need marketing attention this week.
  //    Deterministic portfolio scan (same facts as Distribution Home). Bounded. ──
  try {
    const { getPortfolioMarketingAutopilot } = await import("@/lib/marketing-autopilot/autopilot");
    const portfolio = await getPortfolioMarketingAutopilot({ limit: 200 });
    for (const it of portfolio.items.filter((i) => i.priority === "P0" || i.priority === "P1").slice(0, 6)) {
      actions.push({
        id: `mkt:${it.propertyId}`, kind: "marketing_attention", priority: it.priority === "P0" ? "P0" : "P1",
        title: it.title, reason: it.primaryReason, href: it.href, cta: it.primaryTitle, icon: "Megaphone",
        urgency: it.urgency, entity: { type: "property", id: it.propertyId },
      });
    }
  } catch { /* best-effort */ }

  // ── PIPELINE movement (manager/owner) ──────────────────────────────────────
  let pipeline: DailyCommandCenter["pipeline"] = null;
  if (isManager) {
    const closedRe = /clos|won|lost|cancel/i;
    let stuck = 0; let stuckDays = 0;
    for (const d of deals) {
      if (closedRe.test(d.stage ?? "")) continue;
      const h = hoursSince(d.updated_at ?? d.created_at, nowMs);
      if (Number.isFinite(h) && h >= 14 * 24) { stuck++; stuckDays = Math.max(stuckDays, Math.floor(h / 24)); }
    }
    const advanced = events.filter((e) => e.event_type === "deal.stage_changed").length;
    const newDeals = events.filter((e) => e.event_type === "deal.created").length;
    pipeline = { advanced, newDeals, stuck, stuckExample: stuck > 0 ? { label: "עסקה תקועה", days: stuckDays } : null };
  }

  // ── TEAM exceptions (manager/owner; operational, not surveillance) ──────────
  const team: DailyCommandCenter["team"] = [];
  if (isManager) {
    let unassignedCount = 0;
    try {
      const { count } = await supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).in("stage", OPEN_LEAD_STAGES as never).is("owner_id", null);
      unassignedCount = count ?? 0;
    } catch { /* ignore */ }
    if (unassignedCount > 0) team.push({ id: "team:unassigned", label: `${unassignedCount} לידים ללא שיוך`, count: unassignedCount, href: "/leads" });
    const neverMarketed = coverage?.summary.neverPublished ?? 0;
    if (neverMarketed > 0) team.push({ id: "team:unmarketed", label: `${neverMarketed} נכסים ללא פרסום`, count: neverMarketed, href: "/distribution" });
    if (staleDeals > 0) team.push({ id: "team:staledeals", label: `${staleDeals} עסקאות תקועות`, count: staleDeals, href: "/deals" });
  }

  // ── OVERNIGHT changes (last 24h, whitelist only — no audit noise) ──────────
  const countType = (types: string[]) => events.filter((e) => types.includes(e.event_type)).length;
  const overnight: OvernightChange[] = [];
  const newContacts = countType(["lead.created", "buyer.created", "seller.created"]);
  if (newContacts > 0) overnight.push({ id: "ov:leads", label: `${newContacts} לידים/לקוחות חדשים נכנסו`, icon: "UserPlus", href: "/leads" });
  const dealAdv = countType(["deal.stage_changed"]);
  if (dealAdv > 0) overnight.push({ id: "ov:deal", label: `${dealAdv} עסקאות התקדמו`, icon: "TrendingUp", href: "/deals" });
  const newDealsOv = countType(["deal.created"]);
  if (newDealsOv > 0) overnight.push({ id: "ov:newdeal", label: `${newDealsOv} עסקאות חדשות נפתחו`, icon: "Briefcase", href: "/deals" });
  const meetingsSet = countType(["meeting.scheduled", "meeting.created"]);
  if (meetingsSet > 0) overnight.push({ id: "ov:meet", label: `${meetingsSet} פגישות נקבעו`, icon: "Calendar", href: "/today" });
  const inquiries = countType(["property.contact_clicked"]);
  if (inquiries > 0) overnight.push({ id: "ov:inq", label: `${inquiries} פניות לנכסים`, icon: "MousePointerClick", href: "/properties" });
  if (publishedToday > 0) overnight.push({ id: "ov:pub", label: `${publishedToday} פרסומים עלו`, icon: "Send", href: "/distribution/daily" });

  // ── COMPLETED today (positive closure, real state only) ─────────────────────
  const completedToday: CompletedItem[] = [];
  if (publishedToday > 0) completedToday.push({ id: "done:pub", label: `${publishedToday} פרסומים עלו`, icon: "Send" });
  const meetingsDone = countType(["meeting.completed"]);
  if (meetingsDone > 0) completedToday.push({ id: "done:meet", label: `${meetingsDone} פגישות הושלמו`, icon: "Calendar" });
  if (tasksDoneToday > 0) completedToday.push({ id: "done:task", label: `${tasksDoneToday} משימות טופלו`, icon: "CheckSquare" });

  // ── Rank + hero ─────────────────────────────────────────────────────────────
  const priorityActions = rankDailyActions(actions);
  const actionCount = priorityActions.filter((a) => a.priority === "P0" || a.priority === "P1").length;
  const primaryAction = priorityActions[0] ?? null;
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "";

  return {
    generatedAt: nowIso,
    userFirstName: firstName,
    role,
    isManager,
    heroLine: buildHeroLine(firstName, actionCount),
    actionCount,
    quiet: actionCount === 0,
    primaryAction,
    hero: {
      leadsWaiting: leadRowsOut.length,
      propertiesUnmarketed: (coverage?.summary.neverPublished ?? 0) + (coverage?.summary.noFuture ?? 0),
      campaignsReadyToday: plannedToday,
      publishFailures: failCount,
      meetingsToday: calendar.length,
      overdueTasks,
    },
    priorityActions: priorityActions.slice(0, 12),
    leads: leadRowsOut.slice(0, 6),
    properties: propertyRowsOut.slice(0, 6),
    marketing: { plannedToday, publishedToday, waiting: queued.length, attention: failCount, nextPublishAt },
    calendar: calendar.slice(0, 8),
    pipeline,
    team,
    overnight: overnight.slice(0, 6),
    completedToday,
    onboarding: null,
  };
}
