// ============================================================================
// ☀️ ZONO Daily AI Operating System™ — pure assembler (client-safe). 40.0.
// Re-frames the existing BrokerWorkspace into ONE daily operating system:
// briefing, merged chronological timeline, a single ranked action feed across
// all sources, conversation center, territory, marketing, deals, performance,
// approvals. Deterministic, evidence-only, no side effects.
// ============================================================================
import type { BrokerWorkspace } from "@/lib/broker-workspace/types";
import type { DailyOS, TimelineItem, DailyAction, OperationItem, ActivityFact, DailyBriefing, ExecInput, ExecutiveDaily } from "./types";
import { DAILY_OS_VERSION } from "./types";
import { buildAgenda } from "@/lib/broker-intelligence/agenda";
import { actionClass, recKey } from "@/lib/broker-intelligence/priority";
import type { LifecycleAwareRecommendation } from "@/lib/broker-intelligence/lifecycle";

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const validAt = (iso: string | null | undefined) => !!iso && Number.isFinite(Date.parse(iso));

/**
 * Batch 5.6F — subject routing. A canonical recommendation's entityType is
 * always the SUBJECT (a Journey rec is typed `property`/`buyer`/… — never
 * `journey`), so this resolves Journey recommendations to their subject cockpit
 * rather than a dead raw-UUID journey route. `deal` previously fell through to
 * /today; it now routes to the deals board.
 */
function entityHref(kind: string | null, id: string | null): string {
  if (!id) return "/today";
  switch (kind) {
    case "buyer": return `/buyers/${id}`;
    case "seller": return `/sellers/${id}`;
    case "lead": return `/leads/${id}`;
    case "property": return `/properties/${id}`;
    case "deal": return "/deals";
    // A journey is never a destination — its subject is. If an entityType of
    // "journey" ever reaches here it means a producer regressed; send the broker
    // to the Journey Center rather than to a raw UUID that renders nothing.
    case "journey": return "/journeys";
    default: return "/today";
  }
}

/**
 * Batch 5.6F — assemble the Daily OS.
 *
 * `queue` is the CANONICAL Broker Intelligence priority queue (already deduped,
 * lifecycle-filtered, learning-adjusted, evidence-gated). It is the ONLY ranked
 * action source. `w` (workspace) contributes labels, counts and operational
 * context — it may enrich, never rank.
 *
 * RETIRED HERE (the shadow priority engine): eight hardcoded per-entity loops
 * that hand-built an actionFeed, deduped it BY TITLE, ranked it by a 3-level
 * `impRank`, and sliced to 20 — before any canonical evidence was consulted.
 * Two of those loops (sellersAtRisk, hotBuyers) duplicated what the canonical
 * seller/buyer engines already emit with real evidence; the other six were
 * operational work that already appears elsewhere in this same object
 * (approvals / conversation.waiting / conversation.drafts / marketing.tasks /
 * timeline). None of them are ranking inputs any more.
 */
export function assembleDailyOS(
  queue: LifecycleAwareRecommendation[],
  w: BrokerWorkspace,
  now: number = Date.now(),
  activity: ActivityFact[] = [],
): DailyOS {
  const d = w.dashboard;
  const hour = new Date(now).getHours();
  const greetingWord = hour < 12 ? "בוקר טוב" : hour < 18 ? "צהריים טובים" : "ערב טוב";

  // ── Timeline (meetings + due missions + suggested events) ──────────────────
  const timeline: TimelineItem[] = [
    ...d.upcomingMeetings.filter((m) => validAt(m.startAt)).map((m) => ({ at: m.startAt as string, source: "meeting" as const, title: m.title, detail: m.entityLabel ?? m.type, icon: "📅", href: "/today" })),
    ...d.todaysPriorities.filter((m) => validAt(m.dueAt)).map((m) => ({ at: m.dueAt as string, source: "mission" as const, title: m.title, detail: m.entityName, icon: "🎯", href: entityHref(m.entityType, m.entityId) })),
    ...w.calendar.suggested.filter((s) => validAt(s.suggestedDate)).map((s) => ({ at: s.suggestedDate as string, source: "suggested" as const, title: s.title, detail: s.planType, icon: "💡", href: s.propertyId ? `/properties/${s.propertyId}` : "/today" })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 20);

  // ── THE ranked feed: the canonical queue, scheduled ────────────────────────
  // Scheduling reuses the ONE scheduler (broker-intelligence/agenda) that
  // BrokerTodayAgenda already uses — no duplicate Daily scheduler exists. The
  // queue's order is preserved verbatim; buildAgenda only assigns clock times,
  // so an item that didn't fit the workday is marked scheduled:false (honest
  // overflow) rather than dropped or reordered.
  const agenda = buildAgenda(queue, { now: new Date(now) });
  const slotByKey = new Map(agenda.slots.map((s) => [recKey(s.rec), s]));
  const actionFeed: DailyAction[] = queue.map((r) => {
    const slot = slotByKey.get(recKey(r)) ?? null;
    return {
      id: r.id,
      recKey: recKey(r),
      area: r.area,
      entityType: r.entityType,
      entityId: r.entityId,
      title: r.title,
      why: r.why,
      evidence: r.evidence.map((e) => ({ label: e.label, source: e.source, ...(e.weight != null ? { weight: e.weight } : {}) })),
      confidence: r.confidence,
      priority: r.priority,
      urgency: r.urgency,
      expectedImpact: r.expectedImpact,
      suggestedAction: r.suggestedAction,
      actionClass: actionClass(r),
      mergedCount: r.mergedCount,
      contributingSources: [...r.contributingSources],
      ...(r.learningAdjustment != null ? { learningAdjustment: r.learningAdjustment } : {}),
      lifecycle: r.lifecycle ? { action: r.lifecycle.action, at: r.lifecycle.at, snoozeUntil: r.lifecycle.snoozeUntil ?? null } : null,
      // Canonical href wins; entityHref is the subject-routing fallback.
      href: r.href ?? entityHref(r.entityType, r.entityId),
      startTime: slot?.startTime ?? null,
      endTime: slot?.endTime ?? null,
      durationMin: slot?.durationMin ?? null,
      scheduled: !!slot,
    };
  });

  // ── Operational work — REAL, but not evidence-backed intelligence ──────────
  // Deliberately outside the ranked feed (Part 2). Each carries the class that
  // explains why it isn't a Recommendation, so the gap is registered, not hidden.
  const operations: OperationItem[] = [
    ...d.pendingApprovals.map((a) => ({ id: `ap-${a.id}`, title: `אשר: ${a.recommendation}`, kind: "approve" as const, classification: "operational_reminder" as const, why: a.reason ?? a.agentName ?? "המלצת AI ממתינה לאישור", href: entityHref(a.entityType, a.entityId) })),
    ...w.whatsapp.waitingConversations.map((c) => ({ id: `wa-${c.id}`, title: `השב ל-${c.contactName}`, kind: "reply_whatsapp" as const, classification: "operational_reminder" as const, why: c.reason, href: c.href })),
    ...w.comms.items.map((c) => ({ id: `dr-${c.entityId}`, title: `${c.intent === "first_response" ? "מענה ראשון" : "מעקב"}: ${c.entityName}`, kind: "draft" as const, classification: "operational_reminder" as const, why: c.why, href: c.href })),
    ...w.facebook.tasks.map((f) => ({ id: `fb-${f.title}`, title: f.title, kind: "facebook" as const, classification: "operational_reminder" as const, why: f.detail, href: f.href })),
    ...d.todaysPriorities.map((m) => ({ id: `ms-${m.id}`, title: m.title, kind: "mission" as const, classification: "calendar_item" as const, why: m.reason ?? "משימה פתוחה", href: entityHref(m.entityType, m.entityId) })),
    // Street-level acquisition has NO canonical engine (the acquisition engine
    // scores external_listings, not streets). Registered as a gap rather than
    // smuggled back into the ranked feed on a hand-made "high" priority.
    ...w.territory.acquisitionStreets.slice(0, 3).map((st) => ({ id: `tr-${st.street}`, title: `גיוס ברחוב ${st.street}`, kind: "acquisition_street" as const, classification: "unsupported_legacy_suggestion" as const, why: `ציון גיוס ${st.score}`, href: st.href })),
  ];

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
    operations,
    sinceYouWereAway: activity,
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

function buildBriefing(w: BrokerWorkspace, greetingWord: string, dailyScore: number, actionFeed: DailyAction[]): DailyBriefing {
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
