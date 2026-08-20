// ============================================================================
// ZONO — "היום שלי" (My Day) cockpit — SHARED AGGREGATION LAYER (server-only).
// The single insight layer that feeds the zero-scroll daily cockpit. It REUSES the
// existing engines (no new intelligence, no schema, no AI-logic change): the
// canonical broker-intelligence queue (prioritized + deduped + evidence-based) for
// "דורש טיפול" + "ZI מצא עבורך", the agent daily plan for the time-anchored timeline
// + next-event, and the same KPI/deals/buyers/leads calls the current home uses.
// Everything is org-scoped (RLS) and best-effort; nothing is mocked.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import { getAgentDailyPlan } from "@/lib/daily/daily-plan";
import { getHomeKpiExtras, listTodayTasks } from "@/lib/home/home-service";
import { getSocialLeadsBoard } from "@/lib/social/service";
import { getDealsBoard } from "@/lib/deals/service";
import { listBuyerBoard } from "@/lib/buyers/repository";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

export interface CockpitKpi { id: string; label: string; value: string; icon: string; href: string; accent: "brand" | "success" | "warn" | "danger" | "info" | "neutral" }
export interface CockpitAction { id: string; icon: string; tone: Tone; title: string; sub: string; actionLabel: string; href: string; urgency: "critical" | "high" | "medium" | "low" }
export interface CockpitTimelineItem { id: string; time: string; title: string; detail: string | null; icon: string; tone: Tone; href: string | null; isNext: boolean }
export interface CockpitPipelineStage { stage: string; label: string; count: number; value: number }
export interface CockpitInsight { id: string; icon: string; tone: Tone; text: string; href: string }
export interface CockpitOpportunity { id: string; kind: string; title: string; detail: string; actionLabel: string; href: string | null; score: number | null }
export interface CockpitClient { id: string; name: string; sub: string; tag: string | null; tagTone: Tone; href: string }

export interface MyDayCockpit {
  agentName: string;
  greeting: string;
  dateLabel: string;
  role: "agent" | "manager" | "owner";
  ziBrief: { text: string; ctaLabel: string; ctaHref: string } | null;
  kpis: CockpitKpi[];
  actions: CockpitAction[];
  actionsTotal: number;
  timeline: CockpitTimelineItem[];
  nextEventLabel: string | null;
  timelineTotal: number;
  pipeline: { stages: CockpitPipelineStage[]; pipelineValue: number; weightedRevenue: number };
  insights: CockpitInsight[];
  opportunities: CockpitOpportunity[];
  opportunitiesTotal: number;
  clients: CockpitClient[];
  clientsTotal: number;
  state: "active" | "quiet";
}

const DAY_MS = 86_400_000;
const URGENCY_TONE: Record<string, Tone> = { critical: "danger", high: "warning", medium: "brand", low: "success" };
const AREA_ICON: Record<string, string> = {
  buyer: "Users", seller: "Building", deal: "Handshake", acquisition: "Target",
  daily: "ListChecks", office: "Users", journey: "Route",
};

/** Israel-local hour-of-day greeting, computed on the SERVER (no hydration mismatch). */
function israelGreeting(now: Date): string {
  const hourStr = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).format(now);
  const h = parseInt(hourStr, 10) || 0;
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  return "ערב טוב";
}
function israelDateLabel(now: Date): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" }).format(now);
}
function israelHm(iso: string): string {
  try { return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); }
  catch { return ""; }
}
const ilsC = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n).toLocaleString("he-IL")}`);

/**
 * Assemble the "היום שלי" cockpit view-model. All sources are best-effort: a failed
 * source degrades to an empty section (never a fake zero that misleads — counts come
 * only from sources that actually returned).
 */
export async function getMyDayCockpit(): Promise<MyDayCockpit> {
  const now = new Date();
  const { profile } = await getSessionContext();
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "סוכן";

  const [queueR, planR, kpiR, tasksR, leadsR, dealsR, buyersR] = await Promise.allSettled([
    getBrokerIntelligenceQueue({ limit: 14 }),
    getAgentDailyPlan(),
    getHomeKpiExtras(),
    listTodayTasks(6),
    getSocialLeadsBoard(),
    getDealsBoard(),
    listBuyerBoard(),
  ]);
  const queue = queueR.status === "fulfilled" ? queueR.value : null;
  const plan = planR.status === "fulfilled" ? planR.value : null;
  const kpi = kpiR.status === "fulfilled" ? kpiR.value : null;
  const tasks = tasksR.status === "fulfilled" ? tasksR.value : [];
  const leads = leadsR.status === "fulfilled" ? leadsR.value : null;
  const deals = dealsR.status === "fulfilled" ? dealsR.value : null;
  const buyers = buyersR.status === "fulfilled" ? buyersR.value : null;

  const role = (plan?.plan.role ?? "agent") as "agent" | "manager" | "owner";
  const newLeads = leads?.counts.new ?? 0;

  // ── KPIs (operational, not vanity). Only real, useful metrics. ──────────────
  const attentionCount = queue ? queue.items.filter((i) => i.urgency === "critical" || i.urgency === "high").length : 0;
  const meetingsToday = plan ? plan.plan.buckets.fixedTime.length : 0;
  const kpis: CockpitKpi[] = [
    { id: "leads", label: "לידים חדשים היום", value: String(newLeads), icon: "Users", href: "/leads", accent: "success" },
    { id: "attention", label: "דברים דורשים טיפול", value: String(attentionCount || (queue?.total ?? 0)), icon: "Flame", href: "/action-center", accent: "danger" },
    { id: "meetings", label: "פגישות היום", value: String(meetingsToday), icon: "Calendar", href: "/calendar", accent: "info" },
    { id: "tasks", label: "משימות פעילות", value: String(kpi?.tasksToday ?? tasks.length), icon: "ListChecks", href: "/action-center", accent: "brand" },
  ];

  // ── דורש טיפול — the prioritized action queue (P0/P1 first). Dedup by id. ────
  const usedIds = new Set<string>();
  const usedEntities = new Set<string>();
  const actions: CockpitAction[] = [];
  const opportunities: CockpitOpportunity[] = [];
  if (queue) {
    for (const it of queue.items) {
      const isUrgent = it.urgency === "critical" || it.urgency === "high";
      if (isUrgent && actions.length < 5) {
        actions.push({
          id: it.id, icon: AREA_ICON[it.area] ?? "Bell", tone: URGENCY_TONE[it.urgency] ?? "brand",
          title: it.title, sub: it.why, actionLabel: it.suggestedAction, href: it.href ?? "/action-center", urgency: it.urgency,
        });
        usedIds.add(it.id);
        if (it.entityId) usedEntities.add(`${it.entityType}:${it.entityId}`);
      }
    }
    // ZI מצא עבורך — opportunity tier (matches / lower-urgency), excluding what's already actioned.
    for (const it of queue.items) {
      if (usedIds.has(it.id) || opportunities.length >= 3) continue;
      const isOpp = it.urgency === "medium" || it.urgency === "low" || it.area === "buyer" || it.area === "seller" || it.area === "acquisition";
      if (!isOpp) continue;
      opportunities.push({
        id: it.id, kind: it.area, title: it.title, detail: it.why,
        actionLabel: it.suggestedAction, href: it.href, score: typeof it.priority === "number" ? it.priority : null,
      });
      usedIds.add(it.id);
    }
  }
  const actionsTotal = queue?.total ?? actions.length;
  const opportunitiesTotal = queue ? queue.items.filter((i) => i.area === "buyer" || i.area === "seller" || i.area === "acquisition" || i.urgency === "medium" || i.urgency === "low").length : opportunities.length;

  // ── היום שלי — chronological timeline from the agent plan's fixed-time bucket. ─
  const fixed = plan?.plan.buckets.fixedTime ?? [];
  const nowMs = now.getTime();
  const timelineAll = fixed
    .filter((f) => f.dueAt)
    .map((f) => ({ f, ms: Date.parse(f.dueAt as string) }))
    .sort((a, b) => a.ms - b.ms);
  const nextIdx = timelineAll.findIndex((t) => t.ms >= nowMs);
  const timeline: CockpitTimelineItem[] = timelineAll.slice(0, 5).map((t, i) => ({
    id: t.f.id, time: israelHm(t.f.dueAt as string), title: t.f.title, detail: t.f.reason ?? null,
    icon: t.f.icon || "Calendar", tone: "brand", href: t.f.route ?? null,
    isNext: i === nextIdx,
  }));
  let nextEventLabel: string | null = null;
  if (nextIdx >= 0) {
    const mins = Math.round((timelineAll[nextIdx].ms - nowMs) / 60_000);
    nextEventLabel = mins <= 0 ? "מתחיל עכשיו" : mins < 60 ? `הבא בעוד ${mins} דקות` : `הבא בעוד ${Math.round(mins / 60)} שעות`;
  }

  // ── העסקאות שלי — pipeline (canonical stages) + a few actionable insights. ──
  const pipeline = {
    stages: (deals?.pipeline ?? []).map((s) => ({ stage: s.stage, label: s.label, count: s.count, value: s.value })),
    pipelineValue: deals?.revenue.pipelineValue ?? 0,
    weightedRevenue: deals?.revenue.weightedRevenue ?? 0,
  };
  const insights: CockpitInsight[] = [];
  if (deals) {
    if (deals.atRisk.length > 0) insights.push({ id: "risk", icon: "AlertTriangle", tone: "danger", text: `${deals.atRisk.length} עסקאות בסיכון דורשות תשומת לב`, href: "/deals" });
    if (deals.upcomingClosings.length > 0) insights.push({ id: "close", icon: "Handshake", tone: "success", text: `${deals.upcomingClosings.length} עסקאות לקראת סגירה החודש`, href: "/deals" });
    if (deals.revenue.pipelineValue > 0 && insights.length < 3) insights.push({ id: "pv", icon: "TrendingUp", tone: "brand", text: `${ilsC(deals.revenue.pipelineValue)} פוטנציאל בעסקאות פעילות`, href: "/deals" });
  }

  // ── לקוחות שדורשים תשומת לב — follow-up buyers, deduped vs the action queue. ──
  const clients: CockpitClient[] = [];
  if (buyers) {
    for (const b of buyers.followUp) {
      if (clients.length >= 3) break;
      if (usedEntities.has(`buyer:${b.id}`)) continue; // already surfaced as an urgent action
      const days = b.last_contacted_at ? Math.floor((nowMs - new Date(b.last_contacted_at).getTime()) / DAY_MS) : null;
      const hot = b.temperature === "hot";
      clients.push({
        id: b.id, name: b.full_name || "לקוח",
        sub: days === null ? "טרם נוצר קשר" : `אין קשר ${days} ימים`,
        tag: hot ? "לקוח חם" : "לקוח חמים", tagTone: hot ? "danger" : "warning",
        href: `/buyers/${b.id}`,
      });
    }
  }
  const clientsTotal = buyers?.followUp.length ?? 0;

  // ── ZI brief — DETERMINISTIC (no paid LLM per render); grounded in real counts. ─
  let ziBrief: MyDayCockpit["ziBrief"] = null;
  {
    const parts: string[] = [];
    if (newLeads > 0) parts.push(`${newLeads} לידים חדשים`);
    if (actions.length > 0) parts.push(`${actionsTotal} דברים לטיפול`);
    if (nextEventLabel && timeline[0]) parts.push(`פגישה ב־${timeline.find((t) => t.isNext)?.time ?? timeline[0].time}`);
    if (opportunities.length > 0) parts.push(`${opportunitiesTotal} הזדמנויות ש-ZI מצא`);
    if (parts.length > 0) {
      const top = actions[0] ?? null;
      ziBrief = {
        text: `${parts.slice(0, 3).join(" · ")}. ${top ? `הכי דחוף: ${top.title}.` : "מומלץ להתחיל מהפריט הראשון ברשימת הטיפול."}`,
        ctaLabel: "התחל את היום",
        ctaHref: top?.href ?? "/action-center",
      };
    }
  }

  const state: "active" | "quiet" = (actions.length + timeline.length + opportunities.length + clients.length + newLeads) === 0 ? "quiet" : "active";

  return {
    agentName, greeting: israelGreeting(now), dateLabel: israelDateLabel(now), role,
    ziBrief, kpis,
    actions, actionsTotal,
    timeline, nextEventLabel, timelineTotal: timelineAll.length,
    pipeline, insights,
    opportunities, opportunitiesTotal,
    clients, clientsTotal,
    state,
  };
}
