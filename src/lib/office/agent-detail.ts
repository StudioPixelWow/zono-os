// ============================================================================
// ZONO — Office AGENT DETAIL (server-only). The manager drill-down behind
// /office/agents/[memberId]: one roster member's day, portfolio, leads, deals and
// what needs attention — attributed by the additive office_member_id, working for
// NON-AUTH roster members (no Auth user required). Manager/owner gated + org
// scoped (RLS). Composition only; no new engine, no leaderboard/score.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeListingKind, formatPropertyPrice } from "@/lib/property/transaction";
import { resolveAgentAvatar } from "./avatar";
import { ACTIVE_LEAD_STAGES, ACTIVE_PROPERTY_STATUS as ACTIVE_PROP_STATUS, LATE_DEAL_STAGES as LATE_STAGES } from "./status-predicates";
const STATUS_HE: Record<string, string> = { active: "פעיל", published: "מפורסם", ready: "מוכן", draft: "טיוטה", under_offer: "התקבלה הצעה", in_contract: "בחוזה", sold: "נמכר", rented: "הושכר", withdrawn: "הוסר", archived: "בארכיון" };
const STAGE_HE: Record<string, string> = { new: "חדשה", qualified: "מוסמכת", negotiation: "משא ומתן", agreement: "הסכמה", contract: "חוזה", closing: "סגירה" };

export interface OfficeAgentDetail {
  member: { id: string; name: string; role: string; specialty: string | null; phone: string | null; email: string | null; status: string; avatarUrl: string | null; hasLogin: boolean };
  accessLabel: string;
  stats: { activeProperties: number; openLeads: number; hotLeads: number; overdueLeads: number; activeDeals: number; stuckDeals: number; todayMeetings: number; overdueTasks: number };
  properties: { id: string; title: string; sub: string; price: string; statusLabel: string; href: string }[];
  leads: { id: string; name: string; stage: string; hot: boolean; href: string }[];
  deals: { id: string; title: string; stage: string; value: number | null; ageDays: number | null; stuck: boolean; href: string }[];
  meetingsToday: { id: string; title: string; time: string; kind: string }[];
  needsAttention: { id: string; label: string; sub: string; href: string }[];
}

function israelTodayBounds(now: Date): { start: string; end: string } {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${d}T00:00:00+03:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}
function clockHe(iso: string): string { return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem", hour12: false }).format(new Date(iso)); }
const KIND_HE: Record<string, string> = { meeting: "פגישה", viewing: "ביקור", call: "שיחה", signing: "חתימה", valuation: "הערכת שווי", other: "פגישה" };

/** Assemble one office member's manager drill-down. Null for non-managers or when
 *  the member is not in the caller's org. */
export async function getOfficeAgentDetail(memberId: string): Promise<OfficeAgentDetail | null> {
  if (!memberId) return null;
  const db = await createClient();
  const { data: gate } = await db.rpc("has_min_role", { p_min: "manager" });
  if (gate !== true) return null;
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id;
  if (!orgId) return null;

  const t = (name: string) => db.from(name as never);
  const { data: memberRow } = await t("office_members")
    .select("id,full_name,role,specialty,phone,email,status,avatar_url,user_id")
    .eq("id", memberId).eq("org_id", orgId).maybeSingle();
  const m = memberRow as { id: string; full_name: string; role: string; specialty: string | null; phone: string | null; email: string | null; status: string; avatar_url: string | null; user_id: string | null } | null;
  if (!m) return null;

  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const { start: todayStart, end: todayEnd } = israelTodayBounds(now);

  let linkedAvatar: string | null = null;
  if (m.user_id) {
    const { data: u } = await t("users").select("avatar_url").eq("id", m.user_id).maybeSingle();
    linkedAvatar = (u as { avatar_url: string | null } | null)?.avatar_url ?? null;
  }

  const [propsRes, leadsRes, dealsRes, meetingsRes, tasksRes] = await Promise.all([
    t("properties").select("id,status,title,city,neighborhood,rooms,size_sqm,price,monthly_rent,listing_kind,updated_at").eq("org_id", orgId).eq("office_member_id", memberId).limit(200),
    t("leads").select("id,full_name,stage,score,last_activity_at,created_at").eq("org_id", orgId).eq("office_member_id", memberId).limit(500),
    t("deals").select("id,title,stage,status,value,created_at").eq("org_id", orgId).eq("office_member_id", memberId).limit(200),
    t("meetings").select("id,start_at,status,title,type").eq("org_id", orgId).eq("office_member_id", memberId).gte("start_at", todayStart).lt("start_at", todayEnd).limit(100),
    t("tasks").select("id,title,status,due_at").eq("org_id", orgId).eq("office_member_id", memberId).eq("status", "todo").limit(500),
  ]);

  const props = ((propsRes.data ?? []) as Array<{ id: string; status: string; title: string; city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; price: number | null; monthly_rent: number | null; listing_kind: string | null }>);
  const leads = ((leadsRes.data ?? []) as Array<{ id: string; full_name: string | null; stage: string; score: number | null; last_activity_at: string | null; created_at: string }>);
  const deals = ((dealsRes.data ?? []) as Array<{ id: string; title: string; stage: string; status: string; value: number | null; created_at: string }>);
  const meetings = ((meetingsRes.data ?? []) as Array<{ id: string; start_at: string; status: string; title: string | null; type: string | null }>);
  const tasks = ((tasksRes.data ?? []) as Array<{ id: string; title: string; status: string; due_at: string | null }>);

  const activeProps = props.filter((p) => ACTIVE_PROP_STATUS.has(p.status));
  const openLeads = leads.filter((l) => ACTIVE_LEAD_STAGES.has(l.stage));
  const overdueLeads = openLeads.filter((l) => !!l.last_activity_at && (nowMs - new Date(l.last_activity_at).getTime()) > 3 * 86_400_000);
  const openDeals = deals.filter((d) => d.status === "open");
  const stuckDeals = openDeals.filter((d) => { const age = d.created_at ? (nowMs - new Date(d.created_at).getTime()) / 86_400_000 : 0; return age >= 21 && !LATE_STAGES.has(d.stage); });
  const overdueTasks = tasks.filter((tk) => !!tk.due_at && tk.due_at < nowIso);

  const needsAttention: OfficeAgentDetail["needsAttention"] = [];
  for (const l of overdueLeads.slice(0, 4)) needsAttention.push({ id: `lead:${l.id}`, label: `ליד ללא מענה — ${l.full_name || "ליד"}`, sub: "לא נוצר קשר מעל 3 ימים", href: `/leads/${l.id}` });
  for (const d of stuckDeals.slice(0, 3)) needsAttention.push({ id: `deal:${d.id}`, label: `עסקה תקועה — ${d.title}`, sub: `${STAGE_HE[d.stage] ?? d.stage} · ללא התקדמות`, href: `/deals/${d.id}` });
  for (const tk of overdueTasks.slice(0, 3)) needsAttention.push({ id: `task:${tk.id}`, label: tk.title || "משימה באיחור", sub: "משימה שחלף מועדה", href: "/today/plan" });

  const accessLabel = m.status === "inactive" ? "לא פעיל" : m.status === "invited" ? "ממתין" : m.user_id ? "פעיל · עם כניסה למערכת" : "פעיל · ללא כניסה למערכת";

  return {
    member: { id: m.id, name: m.full_name, role: m.role, specialty: m.specialty, phone: m.phone, email: m.email, status: m.status, avatarUrl: resolveAgentAvatar({ avatarUrl: m.avatar_url, linkedUserAvatarUrl: linkedAvatar }), hasLogin: !!m.user_id },
    accessLabel,
    stats: {
      activeProperties: activeProps.length, openLeads: openLeads.length, hotLeads: openLeads.filter((l) => (l.score ?? 0) >= 85).length, overdueLeads: overdueLeads.length,
      activeDeals: openDeals.length, stuckDeals: stuckDeals.length, todayMeetings: meetings.filter((mt) => mt.status !== "cancelled").length, overdueTasks: overdueTasks.length,
    },
    properties: activeProps.slice(0, 12).map((p) => {
      const kind = normalizeListingKind(p.listing_kind);
      const sub = [p.rooms != null ? `${p.rooms} חד׳` : null, p.neighborhood || p.city || "", p.size_sqm != null ? `${p.size_sqm} מ״ר` : null].filter(Boolean).join(" · ");
      return { id: p.id, title: p.title, sub, price: formatPropertyPrice({ kind, price: p.price, monthlyRent: p.monthly_rent }), statusLabel: STATUS_HE[p.status] ?? p.status, href: `/properties/${p.id}` };
    }),
    leads: openLeads.slice(0, 10).map((l) => ({ id: l.id, name: l.full_name || "ליד", stage: STAGE_HE[l.stage] ?? l.stage, hot: (l.score ?? 0) >= 85, href: `/leads/${l.id}` })),
    deals: openDeals.slice(0, 10).map((d) => { const ageDays = d.created_at ? Math.floor((nowMs - new Date(d.created_at).getTime()) / 86_400_000) : null; return { id: d.id, title: d.title, stage: STAGE_HE[d.stage] ?? d.stage, value: d.value, ageDays, stuck: (ageDays ?? 0) >= 21 && !LATE_STAGES.has(d.stage), href: `/deals/${d.id}` }; }),
    meetingsToday: meetings.filter((mt) => mt.status !== "cancelled").sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 8).map((mt) => ({ id: mt.id, title: mt.title && mt.title.trim() && !mt.title.startsWith("[") ? mt.title : (KIND_HE[mt.type ?? "other"] ?? "פגישה"), time: clockHe(mt.start_at), kind: KIND_HE[mt.type ?? "other"] ?? "פגישה" })),
    needsAttention,
  };
}
