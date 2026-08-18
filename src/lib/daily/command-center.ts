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
  buildHeroLine, humanizeAge, hoursSince, leadTemperature, rankDailyActions,
  type DailyAction, type DailyCommandCenter, type DailyLeadRow, type DailyPropertyRow,
  type DailyRole, type OvernightChange, type CompletedItem, type DailyCalendarItem,
} from "./priority";

const OPEN_LEAD_STAGES = ["new", "contacted", "qualified", "nurturing"];
const israelDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) : null;

const COVERAGE_STATUS_LABEL: Record<string, string> = {
  marketing_now: "משווק כעת", scheduled: "מתוזמן", no_future: "אין פרסום נוסף",
  attention: "דורש טיפול", never_published: "לא פורסם עדיין",
};

interface LeadRow {
  id: string; full_name: string | null; phone: string | null; stage: string;
  score: number | null; source: string | null; created_at: string | null;
  owner_id: string | null; last_activity_at: string | null;
}

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
  const leadsQuery = (() => {
    let q = supabase.from("leads")
      .select("id,full_name,phone,stage,score,source,created_at,owner_id,last_activity_at")
      .eq("org_id", orgId)
      .in("stage", OPEN_LEAD_STAGES);
    if (!isManager && userId) q = q.eq("owner_id", userId);
    return q.order("last_activity_at", { ascending: true, nullsFirst: true }).limit(80);
  })();

  const dealsQuery = (() => {
    let q = supabase.from("deals").select("id,stage,updated_at,created_at,owner_id").eq("org_id", orgId);
    if (!isManager && userId) q = q.eq("owner_id", userId);
    return q.limit(200);
  })();

  const [leadsR, coverageR, publishingR, tasksR, eventsR, dealsR] = await Promise.allSettled([
    leadsQuery,
    getPropertyMarketingCoverage(),
    getPublishingControlData(),
    listTodayTasks(10),
    activityEventRepository.listForOrgSince(sinceIso, 300),
    dealsQuery,
  ]);

  const leadRows: LeadRow[] = leadsR.status === "fulfilled" ? ((leadsR.value.data ?? []) as unknown as LeadRow[]) : [];
  const coverage = coverageR.status === "fulfilled" ? coverageR.value : null;
  const publishing = publishingR.status === "fulfilled" ? publishingR.value : null;
  const tasks = tasksR.status === "fulfilled" ? tasksR.value : [];
  const events = eventsR.status === "fulfilled" ? eventsR.value : [];
  const deals = dealsR.status === "fulfilled" ? ((dealsR.value.data ?? []) as unknown as Array<{ id: string; stage: string; updated_at: string | null; created_at: string | null }>) : [];

  const actions: DailyAction[] = [];

  // ── LEADS → callbacks / follow-up safety net ───────────────────────────────
  const leadRowsOut: DailyLeadRow[] = [];
  for (const l of leadRows) {
    const waiting = l.last_activity_at ?? l.created_at;
    const h = hoursSince(waiting, nowMs);
    const temp = leadTemperature(l.score);
    const unassigned = !l.owner_id;
    const name = (l.full_name ?? "").trim() || "ליד";
    const href = `/leads/${l.id}`;
    let pushed = false, reason = "";
    if (l.stage === "new" && !l.last_activity_at) {
      if (h >= 3) { reason = `ליד חדש ממתין לחזרה ${humanizeAge(waiting, nowMs)}`; actions.push({ id: `lead:${l.id}`, kind: "lead_callback", priority: "P0", title: name, reason, href, cta: "חזרה לליד", icon: "PhoneCall", urgency: Math.min(100, 65 + h), entity: { type: "lead", id: l.id } }); pushed = true; }
      else { reason = "ליד חדש — כדאי לחזור מהר"; actions.push({ id: `lead:${l.id}`, kind: "lead_callback", priority: "P1", title: name, reason, href, cta: "חזרה לליד", icon: "PhoneCall", urgency: 58, entity: { type: "lead", id: l.id } }); pushed = true; }
    } else if (temp === "hot" && h >= 24) {
      reason = `ליד חם ללא מעקב ${humanizeAge(waiting, nowMs)}`;
      actions.push({ id: `lead:${l.id}`, kind: "lead_callback", priority: "P1", title: name, reason, href, cta: "חזרה לליד", icon: "Flame", urgency: Math.min(100, 45 + h / 6), entity: { type: "lead", id: l.id } });
      pushed = true;
    } else if (isManager && unassigned) {
      reason = "ליד ללא שיוך";
      actions.push({ id: `lead:${l.id}`, kind: "lead_unassigned", priority: "P1", title: name, reason, href, cta: "שיוך וטיפול", icon: "UserPlus", urgency: 50, entity: { type: "lead", id: l.id } });
      pushed = true;
    } else if (h >= 72) {
      reason = `לא היה מגע ${humanizeAge(waiting, nowMs)}`;
      actions.push({ id: `lead:${l.id}`, kind: "lead_callback", priority: "P2", title: name, reason, href, cta: "חזרה לליד", icon: "PhoneCall", urgency: Math.min(100, h / 24), entity: { type: "lead", id: l.id } });
      pushed = true;
    }
    if (pushed) leadRowsOut.push({ id: l.id, name, source: l.source, stage: l.stage, temperature: temp, waitingSince: waiting, unassigned, phone: l.phone, href, reason });
  }
  leadRowsOut.sort((a, b) => hoursSince(b.waitingSince, nowMs) - hoursSince(a.waitingSince, nowMs));

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
        .eq("org_id", orgId).in("stage", OPEN_LEAD_STAGES).is("owner_id", null);
      unassignedCount = count ?? 0;
    } catch { /* ignore */ }
    if (unassignedCount > 0) team.push({ id: "team:unassigned", label: `${unassignedCount} לידים ללא שיוך`, count: unassignedCount, href: "/leads" });
    const neverMarketed = coverage?.summary.neverPublished ?? 0;
    if (neverMarketed > 0) team.push({ id: "team:unmarketed", label: `${neverMarketed} נכסים ללא פרסום`, count: neverMarketed, href: "/distribution" });
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
