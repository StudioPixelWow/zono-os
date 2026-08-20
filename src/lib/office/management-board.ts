// ============================================================================
// ZONO — OFFICE MANAGEMENT BOARD (server-only). The office-scoped MANAGEMENT
// view-model behind /office: it makes the screen read as "managing my office"
// (agents · properties · leads · deals) rather than only an exceptions list.
//
// Composition only — NO new CRM engine. Agent attribution reads the additive
// office_members roster + office_member_id links; the existing exception/command
// center (getManagerCommandCenter) is reused verbatim for the attention section,
// and office intelligence is only teased (getOfficeIntelligence stays canonical).
// Org-scoped via the session client (RLS). Best-effort: a failed source degrades
// to an empty section, never a fake number.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getManagerCommandCenter, type ManagerCenterView } from "./manager-command-center";
import { normalizeListingKind, formatPropertyPrice, type ListingKind } from "@/lib/property/transaction";
import { resolveAgentAvatar } from "./avatar";

const ACTIVE_LEAD_STAGES = new Set(["new", "contacted", "qualified", "nurturing"]);
const ACTIVE_PROP_STATUS = new Set(["active", "published", "ready", "under_offer", "in_contract"]);

export interface OfficeAgentCard {
  id: string; name: string; role: string; specialty: string | null; status: string;
  avatarUrl: string | null; hasLogin: boolean;
  activeProperties: number; openLeads: number; activeDeals: number; todayMeetings: number; overdueFollowups: number;
  attention: number; // needs-attention count (overdue + unhandled) — the "דורש טיפול" chip
}
export interface OfficePropertyCard {
  id: string; title: string; sub: string; price: string; kind: ListingKind | null;
  status: string; statusLabel: string; exclusive: boolean; imageUrl: string | null;
  agentName: string | null; agentAvatarUrl: string | null; interested: number; href: string;
}
export interface OfficeDealRow {
  id: string; title: string; stage: string; value: number | null; agentName: string | null; agentAvatarUrl: string | null;
  ageDays: number | null; stuck: boolean; href: string;
}
export interface OfficeMeetingRow { id: string; title: string; time: string; agentName: string | null; agentAvatarUrl: string | null; kind: string }
export interface OfficeEventRow { id: string; title: string; when: string; icon: string }
export interface OfficeLeadDistRow { id: string; name: string; avatarUrl: string | null; count: number }
export interface OfficeManagerCard { id: string; name: string; role: string; specialty: string | null; avatarUrl: string | null; hasLogin: boolean }
/** Assignment-popover option: an active roster agent with workload context. */
export interface OfficeAgentOption { id: string; name: string; avatarUrl: string | null; openLeads: number; overdue: number; hasLogin: boolean }
export interface OfficeQueueItem { id: string; title: string; sub: string; href: string; assign?: "lead" | "property" }
export interface OfficeQueue { key: string; title: string; icon: string; tone: string; count: number; items: OfficeQueueItem[]; moreHref: string }
export interface OfficeApprovalItem { id: string; title: string; sub: string; href: string; tone: string }
export interface OfficeManagementBoard {
  officeName: string;
  summary: { agents: number; activeProperties: number; activeLeads: number; activeDeals: number; meetingsToday: number };
  manager: OfficeManagerCard | null;        // the owner/manager — shown separately, NOT counted as an agent
  agents: OfficeAgentCard[];
  agentOptions: OfficeAgentOption[];         // assignment targets (active agents + workload context)
  properties: OfficePropertyCard[];
  propertiesTotal: number;
  leads: { unassigned: number; hot: number; overdue: number; newToday: number; byAgent: OfficeLeadDistRow[] };
  deals: { active: number; stuck: number; lateStage: number; wonPeriod: number; rows: OfficeDealRow[] };
  queues: OfficeQueue[];                      // "דורש החלטה ממך" — actionable manager queues
  approvals: { count: number; items: OfficeApprovalItem[] };  // "ממתין לאישור שלי"
  meetingsToday: OfficeMeetingRow[];        // "היום במשרד" — real meetings for today
  recentEvents: OfficeEventRow[];           // recent real office events
  intelligenceTeaser: { text: string; tone: string }[];
  center: ManagerCenterView["center"];      // canonical exceptions (source for queues/approvals)
  reassignAgents: { id: string; name: string }[];
}

const STATUS_HE: Record<string, string> = {
  active: "פעיל", published: "מפורסם", ready: "מוכן", draft: "טיוטה", under_offer: "התקבלה הצעה",
  in_contract: "בחוזה", sold: "נמכר", rented: "הושכר", withdrawn: "הוסר", archived: "בארכיון",
};
const MEETING_KIND_HE: Record<string, string> = {
  meeting: "פגישה", viewing: "ביקור", call: "שיחה", signing: "חתימה", valuation: "הערכת שווי", other: "פגישה",
};
const EVENT_ICON: Record<string, string> = {
  "lead.created": "UserPlus", "lead.contacted": "MessageCircle", "property.contact_clicked": "Building",
  "deal.updated": "Handshake", "meeting.scheduled": "Calendar",
};
function clockHe(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem", hour12: false }).format(new Date(iso));
}
function relativeHe(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const h = Math.max(0, (nowMs - t) / 3_600_000);
  if (h < 1) return "לפני פחות משעה";
  if (h < 24) return `לפני ${Math.floor(h)} שעות`;
  const d = Math.floor(h / 24);
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
}

function israelTodayBounds(now: Date): { start: string; end: string } {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${d}T00:00:00+03:00`); // Asia/Jerusalem (DST handled approximately; bounds only)
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Assemble the office-management board for the current manager/owner. Returns null
 *  for non-managers (the page redirects them), mirroring getManagerCommandCenter. */
export async function getOfficeManagementBoard(): Promise<OfficeManagementBoard | null> {
  const managerView = await getManagerCommandCenter();
  if (!managerView) return null; // agent / no-org → caller redirects to personal day

  const { profile } = await getSessionContext();
  const orgId = profile?.org_id;
  if (!orgId) return null;
  const db = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const { start: todayStart, end: todayEnd } = israelTodayBounds(now);

  // Cast table refs to `never` (codebase pattern) — office_members + the additive
  // office_member_id columns are not yet in the generated schema types.
  const t = (name: string) => db.from(name as never);
  const [orgRes, membersRes, propsRes, leadsRes, dealsRes, meetingsRes, tasksRes, recsRes, officeIntelRes, activityRes] = await Promise.all([
    t("organizations").select("name").eq("id", orgId).maybeSingle(),
    t("office_members").select("id,full_name,role,specialty,status,avatar_url,user_id").eq("org_id", orgId).order("role", { ascending: false }),
    t("properties").select("id,office_member_id,status,title,city,neighborhood,rooms,size_sqm,price,monthly_rent,listing_kind,has_exclusivity,primary_image_url,updated_at").eq("org_id", orgId).limit(500),
    t("leads").select("id,office_member_id,owner_id,full_name,stage,score,last_activity_at,created_at").eq("org_id", orgId).limit(1000),
    t("deals").select("id,office_member_id,title,stage,status,value,created_at,closed_at").eq("org_id", orgId).limit(500),
    t("meetings").select("id,office_member_id,start_at,status,title,type").eq("org_id", orgId).gte("start_at", todayStart).lt("start_at", todayEnd).limit(500),
    t("tasks").select("id,office_member_id,status,due_at").eq("org_id", orgId).eq("status", "todo").limit(2000),
    t("customer_property_recommendations").select("property_id,status").eq("org_id", orgId).in("status", ["interested", "viewing_requested"]).limit(2000).then((r) => r, () => ({ data: [] as { property_id: string; status: string }[] })),
    t("office_intelligence_profiles").select("ai_office_summary,ai_management_plan,office_health_score,health_level").eq("organization_id", orgId).maybeSingle().then((r) => r, () => ({ data: null })),
    t("activity_events").select("id,title,event_type,occurred_at").eq("org_id", orgId).order("occurred_at", { ascending: false }).limit(6).then((r) => r, () => ({ data: [] as { id: string; title: string; event_type: string; occurred_at: string }[] })),
  ]);

  const members = (membersRes.data ?? []) as { id: string; full_name: string; role: string; specialty: string | null; status: string; avatar_url: string | null; user_id: string | null }[];
  const props = (propsRes.data ?? []) as Array<{ id: string; office_member_id: string | null; status: string; title: string; city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; price: number | null; monthly_rent: number | null; listing_kind: string | null; has_exclusivity: boolean | null; primary_image_url: string | null }>;
  const leads = (leadsRes.data ?? []) as Array<{ id: string; office_member_id: string | null; owner_id: string | null; full_name: string | null; stage: string; score: number | null; last_activity_at: string | null; created_at: string }>;
  const deals = (dealsRes.data ?? []) as Array<{ id: string; office_member_id: string | null; title: string; stage: string; status: string; value: number | null; created_at: string; closed_at: string | null }>;
  const meetings = (meetingsRes.data ?? []) as Array<{ id: string; office_member_id: string | null; start_at: string; status: string; title: string | null; type: string | null }>;
  const tasks = (tasksRes.data ?? []) as Array<{ id: string; office_member_id: string | null; status: string; due_at: string | null }>;
  const recs = ((recsRes as { data: { property_id: string; status: string }[] | null }).data ?? []);
  const events = (((activityRes as { data: { id: string; title: string; event_type: string; occurred_at: string }[] | null }).data) ?? []);

  // Linked-user avatars (single query) — the fallback when a roster member has no
  // own avatar but is linked to an Auth user with one (spec avatar resolution #2).
  const linkedUserIds = members.map((m) => m.user_id).filter((x): x is string => !!x);
  const userAvatarOf = new Map<string, string | null>();
  if (linkedUserIds.length) {
    const uRes = await t("users").select("id,avatar_url").in("id", linkedUserIds).then((r) => r, () => ({ data: [] as { id: string; avatar_url: string | null }[] }));
    for (const u of (((uRes as { data: { id: string; avatar_url: string | null }[] | null }).data) ?? [])) userAvatarOf.set(u.id, u.avatar_url);
  }
  const avatarOfMember = (m: { avatar_url: string | null; user_id: string | null }): string | null =>
    resolveAgentAvatar({ avatarUrl: m.avatar_url, linkedUserAvatarUrl: m.user_id ? userAvatarOf.get(m.user_id) ?? null : null });

  const nameOf = new Map(members.map((m) => [m.id, m.full_name]));
  const avatarById = new Map(members.map((m) => [m.id, avatarOfMember(m)]));
  const interestedByProp = new Map<string, number>();
  for (const r of recs) interestedByProp.set(r.property_id, (interestedByProp.get(r.property_id) ?? 0) + 1);

  // ── Per-agent management cards (roster + real counts) ────────────────────────
  const agents: OfficeAgentCard[] = members.map((m) => {
    const activeProperties = props.filter((p) => p.office_member_id === m.id && ACTIVE_PROP_STATUS.has(p.status)).length;
    const openLeads = leads.filter((l) => l.office_member_id === m.id && ACTIVE_LEAD_STAGES.has(l.stage)).length;
    const activeDeals = deals.filter((d) => d.office_member_id === m.id && d.status === "open").length;
    const todayMeetings = meetings.filter((mt) => mt.office_member_id === m.id && mt.status !== "cancelled").length;
    const overdueFollowups = tasks.filter((t) => t.office_member_id === m.id && !!t.due_at && t.due_at < nowIso).length;
    return {
      id: m.id, name: m.full_name, role: m.role, specialty: m.specialty, status: m.status,
      avatarUrl: avatarById.get(m.id) ?? null, hasLogin: !!m.user_id,
      activeProperties, openLeads, activeDeals, todayMeetings, overdueFollowups,
      attention: overdueFollowups,
    };
  });

  // ── Office summary ───────────────────────────────────────────────────────────
  const activeProps = props.filter((p) => ACTIVE_PROP_STATUS.has(p.status));
  const summary = {
    agents: members.filter((m) => m.status === "active" && m.role !== "owner").length,
    activeProperties: activeProps.length,
    activeLeads: leads.filter((l) => ACTIVE_LEAD_STAGES.has(l.stage)).length,
    activeDeals: deals.filter((d) => d.status === "open").length,
    meetingsToday: meetings.filter((mt) => mt.status !== "cancelled").length,
  };

  // ── Property cards (real estate first) — a strong sample, most-recent first ──
  const propertyCards: OfficePropertyCard[] = activeProps.slice(0, 8).map((p) => {
    const kind = normalizeListingKind(p.listing_kind);
    const place = p.neighborhood || p.city || "";
    const sub = [p.rooms != null ? `${p.rooms} חד׳` : null, place, p.size_sqm != null ? `${p.size_sqm} מ״ר` : null].filter(Boolean).join(" · ");
    return {
      id: p.id, title: p.title, sub, kind,
      price: formatPropertyPrice({ kind, price: p.price, monthlyRent: p.monthly_rent }),
      status: p.status, statusLabel: STATUS_HE[p.status] ?? p.status,
      exclusive: p.has_exclusivity === true, imageUrl: p.primary_image_url,
      agentName: p.office_member_id ? nameOf.get(p.office_member_id) ?? null : null,
      agentAvatarUrl: p.office_member_id ? avatarById.get(p.office_member_id) ?? null : null,
      interested: interestedByProp.get(p.id) ?? 0,
      href: `/properties/${p.id}`,
    };
  });

  // ── Leads management summary ─────────────────────────────────────────────────
  const leadByAgent = new Map<string, number>();
  for (const l of leads) if (l.office_member_id && ACTIVE_LEAD_STAGES.has(l.stage)) leadByAgent.set(l.office_member_id, (leadByAgent.get(l.office_member_id) ?? 0) + 1);
  const leadsSummary = {
    unassigned: leads.filter((l) => !l.office_member_id && ACTIVE_LEAD_STAGES.has(l.stage)).length,
    hot: leads.filter((l) => (l.score ?? 0) >= 85 && ACTIVE_LEAD_STAGES.has(l.stage)).length,
    overdue: leads.filter((l) => ACTIVE_LEAD_STAGES.has(l.stage) && !!l.last_activity_at && (now.getTime() - new Date(l.last_activity_at).getTime()) > 3 * 86_400_000).length,
    newToday: leads.filter((l) => l.created_at >= todayStart).length,
    byAgent: [...leadByAgent.entries()].map(([id, count]) => ({ id, name: nameOf.get(id) ?? "סוכן", avatarUrl: avatarById.get(id) ?? null, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };

  // ── Deals management summary + a few actionable rows ─────────────────────────
  const LATE_STAGES = new Set(["agreement", "contract", "closing"]);
  const openDeals = deals.filter((d) => d.status === "open");
  const dealRows: OfficeDealRow[] = openDeals
    .map((d) => {
      const ageDays = d.created_at ? Math.floor((now.getTime() - new Date(d.created_at).getTime()) / 86_400_000) : null;
      const stuck = (ageDays ?? 0) >= 21 && !LATE_STAGES.has(d.stage);
      return { id: d.id, title: d.title, stage: d.stage, value: d.value, agentName: d.office_member_id ? nameOf.get(d.office_member_id) ?? null : null, agentAvatarUrl: d.office_member_id ? avatarById.get(d.office_member_id) ?? null : null, ageDays, stuck, href: `/deals/${d.id}` };
    })
    .sort((a, b) => Number(b.stuck) - Number(a.stuck) || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5);
  const dealsSummary = {
    active: openDeals.length,
    stuck: openDeals.filter((d) => { const age = d.created_at ? (now.getTime() - new Date(d.created_at).getTime()) / 86_400_000 : 0; return age >= 21 && !LATE_STAGES.has(d.stage); }).length,
    lateStage: openDeals.filter((d) => LATE_STAGES.has(d.stage)).length,
    wonPeriod: deals.filter((d) => d.status === "won" && !!d.closed_at && (now.getTime() - new Date(d.closed_at).getTime()) <= 30 * 86_400_000).length,
    rows: dealRows,
  };

  // ── Rail: today's real office meetings (soonest first) ───────────────────────
  const meetingsToday: OfficeMeetingRow[] = meetings
    .filter((mt) => mt.status !== "cancelled")
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 5)
    .map((mt) => ({
      id: mt.id,
      title: mt.title && mt.title.trim() && !mt.title.startsWith("[") ? mt.title : (MEETING_KIND_HE[mt.type ?? "other"] ?? "פגישה"),
      time: clockHe(mt.start_at),
      agentName: mt.office_member_id ? nameOf.get(mt.office_member_id) ?? null : null,
      agentAvatarUrl: mt.office_member_id ? avatarById.get(mt.office_member_id) ?? null : null,
      kind: MEETING_KIND_HE[mt.type ?? "other"] ?? "פגישה",
    }));

  // ── Rail: a few most-recent real office events ───────────────────────────────
  const recentEvents: OfficeEventRow[] = events.slice(0, 3).map((ev) => ({
    id: ev.id,
    title: ev.title || ev.event_type,
    when: relativeHe(ev.occurred_at, now.getTime()),
    icon: EVENT_ICON[ev.event_type] ?? "Sparkles",
  }));

  // ── Intelligence teaser (canonical office_intelligence_profiles; no recompute) ─
  const oi = (officeIntelRes as { data: { ai_office_summary: string | null; ai_management_plan: string | null; office_health_score: number | null } | null }).data;
  const intelligenceTeaser: { text: string; tone: string }[] = [];
  if (oi?.ai_office_summary) intelligenceTeaser.push({ text: oi.ai_office_summary, tone: "brand" });
  if (oi?.ai_management_plan) intelligenceTeaser.push({ text: oi.ai_management_plan, tone: "neutral" });

  // ── Manager card (the owner/manager roster member — shown separately, never an agent) ─
  const managerMember = members.find((m) => m.role === "owner") ?? null;
  const manager: OfficeManagerCard | null = managerMember
    ? { id: managerMember.id, name: managerMember.full_name, role: managerMember.role, specialty: managerMember.specialty, avatarUrl: avatarById.get(managerMember.id) ?? null, hasLogin: !!managerMember.user_id }
    : null;

  // ── Assignment targets (active agents + workload context for the popover) ─────
  const agentOptions: OfficeAgentOption[] = agents
    .filter((a) => a.role !== "owner" && a.status === "active")
    .map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl, openLeads: a.openLeads, overdue: a.overdueFollowups, hasLogin: a.hasLogin }));

  // ── Management queues — "דורש החלטה ממך" (actionable; only rendered when non-empty) ─
  const agingHe = (iso: string | null) => (iso ? relativeHe(iso, now.getTime()) : "");
  const activeLead = (l: { stage: string }) => ACTIVE_LEAD_STAGES.has(l.stage);
  const queues: OfficeQueue[] = [];

  const unassignedLeadRows = leads.filter((l) => activeLead(l) && !l.office_member_id);
  if (unassignedLeadRows.length) queues.push({
    key: "unassigned_leads", title: "לידים ללא אחראי", icon: "UserPlus", tone: "danger", count: unassignedLeadRows.length,
    items: unassignedLeadRows.slice(0, 3).map((l) => ({ id: l.id, title: l.full_name || "ליד", sub: `חדש ${agingHe(l.created_at)}`, href: `/leads/${l.id}`, assign: "lead" as const })),
    moreHref: "/leads",
  });

  const overdueLeadRows = leads.filter((l) => activeLead(l) && !!l.last_activity_at && (now.getTime() - new Date(l.last_activity_at).getTime()) > 3 * 86_400_000);
  if (overdueLeadRows.length) queues.push({
    key: "overdue_leads", title: "לידים באיחור", icon: "AlertTriangle", tone: "warning", count: overdueLeadRows.length,
    items: overdueLeadRows.slice(0, 3).map((l) => ({ id: l.id, title: l.full_name || "ליד", sub: `ללא מענה · ${agingHe(l.last_activity_at)}`, href: `/leads/${l.id}`, assign: l.office_member_id ? undefined : ("lead" as const) })),
    moreHref: "/leads",
  });

  const unassignedPropRows = activeProps.filter((p) => !p.office_member_id);
  if (unassignedPropRows.length) queues.push({
    key: "unassigned_properties", title: "נכסים ללא סוכן", icon: "Home", tone: "warning", count: unassignedPropRows.length,
    items: unassignedPropRows.slice(0, 3).map((p) => ({ id: p.id, title: p.title, sub: [p.neighborhood || p.city, STATUS_HE[p.status] ?? p.status].filter(Boolean).join(" · "), href: `/properties/${p.id}`, assign: "property" as const })),
    moreHref: "/properties",
  });

  const unmarketed = managerView.center.groups.properties.filter((e) => e.type === "property_not_marketed" || e.type === "property_no_future_marketing");
  if (unmarketed.length) queues.push({
    key: "unmarketed", title: "נכסים ללא שיווק", icon: "Building", tone: "warning", count: unmarketed.length,
    items: unmarketed.slice(0, 3).map((e) => ({ id: e.id, title: e.title, sub: e.subtitle, href: e.route })),
    moreHref: "/properties",
  });

  const stuckDealRows = dealRows.filter((d) => d.stuck);
  if (stuckDealRows.length) queues.push({
    key: "stuck_deals", title: "עסקאות תקועות", icon: "Handshake", tone: "danger", count: dealsSummary.stuck,
    items: stuckDealRows.slice(0, 3).map((d) => ({ id: d.id, title: d.title, sub: `${d.ageDays ?? "?"} ימים ללא התקדמות`, href: d.href })),
    moreHref: "/deals",
  });

  // ── Approval center — "ממתין לאישור שלי" (marketing approvals + escalations) ──
  const approvalEx = [
    ...managerView.center.groups.marketing.filter((e) => e.type === "marketing_plan_waiting_approval" || e.type === "marketing_plan_failed" || e.type === "publish_failed"),
    ...managerView.center.groups.operations.filter((e) => e.type === "support_escalation" || e.type === "billing_action_required"),
  ];
  const approvals = {
    count: approvalEx.length,
    items: approvalEx.slice(0, 5).map((e) => ({ id: e.id, title: e.title, sub: e.subtitle, href: e.route, tone: e.priority === "P0" ? "danger" : "brand" })),
  };

  return {
    officeName: ((orgRes.data as { name?: string } | null)?.name) || "המשרד שלי",
    summary, manager, agents, agentOptions, properties: propertyCards, propertiesTotal: activeProps.length,
    leads: leadsSummary, deals: dealsSummary, queues, approvals, meetingsToday, recentEvents, intelligenceTeaser,
    center: managerView.center, reassignAgents: managerView.agents,
  };
}
