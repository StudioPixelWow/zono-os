// ============================================================================
// ☀️ ZONO Daily AI Operating System™ — pure assembler (client-safe). 40.0.
// Re-frames the existing BrokerWorkspace into ONE daily operating system:
// briefing, merged chronological timeline, a single ranked action feed across
// all sources, conversation center, territory, marketing, deals, performance,
// approvals. Deterministic, evidence-only, no side effects.
// ============================================================================
import type { BrokerWorkspace } from "@/lib/broker-workspace/types";
import type { DailyOS, TimelineItem, ActionItem, DailyBriefing, Impact, ExecInput, ExecutiveDaily } from "./types";
import { DAILY_OS_VERSION } from "./types";

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const impRank: Record<Impact, number> = { high: 3, medium: 2, low: 1 };
const validAt = (iso: string | null | undefined) => !!iso && Number.isFinite(Date.parse(iso));

function entityHref(kind: string | null, id: string | null): string {
  if (!id) return "/today";
  switch (kind) { case "buyer": return `/buyers/${id}`; case "seller": return `/sellers/${id}`; case "lead": return `/leads/${id}`; case "property": return `/properties/${id}`; default: return "/today"; }
}

export function assembleDailyOS(w: BrokerWorkspace, now: number = Date.now()): DailyOS {
  const d = w.dashboard;
  const hour = new Date(now).getHours();
  const greetingWord = hour < 12 ? "בוקר טוב" : hour < 18 ? "צהריים טובים" : "ערב טוב";

  // ── Timeline (meetings + due missions + suggested events) ──────────────────
  const timeline: TimelineItem[] = [
    ...d.upcomingMeetings.filter((m) => validAt(m.startAt)).map((m) => ({ at: m.startAt as string, source: "meeting" as const, title: m.title, detail: m.entityLabel ?? m.type, icon: "📅", href: "/today" })),
    ...d.todaysPriorities.filter((m) => validAt(m.dueAt)).map((m) => ({ at: m.dueAt as string, source: "mission" as const, title: m.title, detail: m.entityName, icon: "🎯", href: entityHref(m.entityType, m.entityId) })),
    ...w.calendar.suggested.filter((s) => validAt(s.suggestedDate)).map((s) => ({ at: s.suggestedDate as string, source: "suggested" as const, title: s.title, detail: s.planType, icon: "💡", href: s.propertyId ? `/properties/${s.propertyId}` : "/today" })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 20);

  // ── Unified action feed (all sources, ranked) ──────────────────────────────
  const actions: ActionItem[] = [];
  for (const a of d.pendingApprovals) actions.push({ id: `ap-${a.id}`, title: `אשר: ${a.recommendation}`, kind: "approve", priority: a.impact, why: a.reason ?? a.agentName ?? "המלצת AI", href: entityHref(a.entityType, a.entityId) });
  for (const c of w.whatsapp.waitingConversations) actions.push({ id: `wa-${c.id}`, title: `השב ל-${c.contactName}`, kind: "reply_whatsapp", priority: c.urgency >= 70 ? "high" : "medium", why: c.reason, href: c.href });
  for (const c of w.comms.items) actions.push({ id: `dr-${c.entityId}`, title: `${c.intent === "first_response" ? "מענה ראשון" : "מעקב"}: ${c.entityName}`, kind: "draft", priority: "medium", why: c.why, href: c.href });
  for (const f of w.facebook.tasks) actions.push({ id: `fb-${f.title}`, title: f.title, kind: "facebook", priority: "medium", why: f.detail, href: f.href });
  for (const m of d.todaysPriorities) actions.push({ id: `ms-${m.id}`, title: m.title, kind: "mission", priority: m.priority, why: m.reason ?? "משימה פתוחה", href: entityHref(m.entityType, m.entityId) });
  for (const st of w.territory.acquisitionStreets.slice(0, 3)) actions.push({ id: `tr-${st.street}`, title: `גיוס ברחוב ${st.street}`, kind: "acquisition", priority: "high", why: `ציון גיוס ${st.score}`, href: st.href });
  for (const s of d.sellersAtRisk.slice(0, 2)) actions.push({ id: `sr-${s.id}`, title: `טפל במוכר בסיכון: ${s.name}`, kind: "seller_risk", priority: "high", why: s.riskLabel ?? "סיכון נטישה", href: s.href });
  for (const b of d.hotBuyers.slice(0, 2)) actions.push({ id: `hb-${b.id}`, title: `התקשר לקונה חם: ${b.name}`, kind: "hot_buyer", priority: "medium", why: b.reason ?? "קונה חם", href: b.href });

  const seen = new Set<string>();
  const actionFeed = actions
    .filter((a) => (seen.has(a.title) ? false : (seen.add(a.title), true)))
    .sort((a, b) => impRank[b.priority] - impRank[a.priority])
    .slice(0, 20);

  // ── Performance + daily score ──────────────────────────────────────────────
  const p = w.performance;
  const dailyScore = clamp(55 + p.followUpRatePct * 0.25 - p.weakSpots.length * 6 + Math.min(20, p.conversionOpportunities * 4));

  // ── Briefing ───────────────────────────────────────────────────────────────
  const briefing = buildBriefing(w, greetingWord, dailyScore, actionFeed);

  return {
    version: DAILY_OS_VERSION,
    brokerName: w.brokerName,
    generatedAt: new Date(now).toISOString(),
    briefing,
    timeline,
    actionFeed,
    conversation: {
      whatsappUnread: w.whatsapp.unread, whatsappWaiting: w.whatsapp.waiting,
      facebookComments: w.facebook.commentsWaiting, facebookLeads: w.facebook.leadApprovals,
      waiting: w.whatsapp.waitingConversations.slice(0, 8).map((c) => ({ name: c.contactName, reason: c.reason, href: c.href })),
      drafts: w.comms.items.slice(0, 8),
    },
    territory: w.territory,
    marketing: { scheduledToday: w.facebook.scheduledToday, commentsWaiting: w.facebook.commentsWaiting, leadApprovals: w.facebook.leadApprovals, groupsToPublish: w.facebook.groupsToPublish, tasks: w.facebook.tasks },
    deals: { hotBuyers: d.hotBuyers.slice(0, 8), sellersAtRisk: d.sellersAtRisk.slice(0, 8), criticalListings: d.criticalListings.slice(0, 8), leadFollowUps: d.leadFollowUps.slice(0, 8) },
    performance: { daily: dailyScore, weekly: dailyScore, conversionOpportunities: p.conversionOpportunities, followUpRatePct: p.followUpRatePct, weakSpots: p.weakSpots },
    approvals: [
      ...d.pendingApprovals.map((a) => ({ id: a.id, title: a.recommendation, why: a.reason ?? "", source: a.agentName ?? "AI", href: entityHref(a.entityType, a.entityId) })),
      ...w.inbox.filter((i) => i.requiresApproval && i.status === "pending").map((i) => ({ id: i.id, title: i.recommendation, why: i.reason ?? "", source: i.agentName ?? "AI", href: entityHref(i.entityType, i.entityId) })),
    ].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i).slice(0, 20),
    ask: ["מה הכי דחוף עכשיו?", "למי כדאי להתקשר?", "מה עליי לאשר?", "איפה אני מפספס לידים?", "מה השתנה היום?"],
    notes: w.notes,
  };
}

function buildBriefing(w: BrokerWorkspace, greetingWord: string, dailyScore: number, actionFeed: ActionItem[]): DailyBriefing {
  const d = w.dashboard;
  const opp = d.hotBuyers[0]
    ? { label: d.hotBuyers[0].name, detail: d.hotBuyers[0].reason ?? "קונה חם לסגירה", href: d.hotBuyers[0].href }
    : w.territory.acquisitionStreets[0]
    ? { label: `רחוב ${w.territory.acquisitionStreets[0].street}`, detail: `ציון גיוס ${w.territory.acquisitionStreets[0].score}`, href: w.territory.acquisitionStreets[0].href }
    : null;
  const risk = d.sellersAtRisk[0]
    ? { label: d.sellersAtRisk[0].name, detail: d.sellersAtRisk[0].riskLabel ?? "מוכר בסיכון נטישה", href: d.sellersAtRisk[0].href }
    : null;
  const aiSummary = w.briefing.items[0]?.answer
    ?? `${actionFeed.length} פעולות היום · ${w.whatsapp.waiting} שיחות ממתינות · ${d.pendingApprovals.length} אישורים.`;
  return {
    greeting: `${greetingWord}, ${w.brokerName} 👋`,
    dailyScore,
    focus: actionFeed[0]?.title ?? "אין פעולות דחופות — יום טוב להתרחבות.",
    biggestOpportunity: opp,
    biggestRisk: risk,
    aiSummary,
  };
}

// ── Executive mode (pure map from Chief-of-Staff lean input) ─────────────────
export function buildExecutiveDaily(input: ExecInput): ExecutiveDaily {
  const health: ExecutiveDaily["officeHealth"] = input.orgScore.overall >= 70 ? "strong" : input.orgScore.overall >= 45 ? "fair" : "weak";
  return {
    version: DAILY_OS_VERSION, generatedAt: new Date().toISOString(),
    orgScore: input.orgScore, officeHealth: health,
    priorities: input.priorities.slice(0, 6), risks: input.risks.slice(0, 6), opportunities: input.opportunities.slice(0, 6), insights: input.insights.slice(0, 6),
    notes: input.notes,
  };
}
