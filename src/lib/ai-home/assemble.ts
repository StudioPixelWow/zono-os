// ============================================================================
// 🏠 Unified AI Workspace — pure assembly (grouping / sorting / merging). 30.2.
// Parts 2–7. UX shaping only — no intelligence is computed here.
// ============================================================================
import type {
  HomeInput, AiHomeData, TodayDashboard, OpportunityCenter, OpportunityGroup, RiskCenter,
  ExecutionCenter, AiInsights, HomeTimelineEvent, PriorityBand, ContextPanelData, MissionRef,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const bandOf = (score: number): PriorityBand => (score >= 70 ? "high" : score >= 45 ? "medium" : "low");
const BAND_LABEL: Record<PriorityBand, string> = { high: "עדיפות גבוהה", medium: "עדיפות בינונית", low: "עדיפות נמוכה" };

// ── Part 2 — Today dashboard ────────────────────────────────────────────────
function buildToday(input: HomeInput): TodayDashboard {
  const s = input.signals;
  return {
    businessScore: clamp(s.businessScore), executionScore: clamp(s.executionScore), aiConfidence: clamp(s.aiConfidence),
    priorities: s.priorities.slice(0, 6),
    criticalRisks: s.criticalRisks.slice(0, 6),
    topOpportunities: s.briefingOpportunities.slice(0, 6),
    approvalsWaiting: input.inbox.filter((i) => i.requiresApproval && i.status === "pending").length,
    missionsToday: input.missions.today,
    urgentFollowUps: s.urgentMissions.length + input.missions.blocked,
    hotBuyers: input.pipelines.buyers.items.slice(0, 5),
    hotSellers: input.pipelines.sellers.items.slice(0, 5),
    criticalListings: input.pipelines.listings.items.slice(0, 5),
  };
}

// ── Part 3 — Opportunity center (grouped by priority) ───────────────────────
function buildOpportunities(input: HomeInput): OpportunityCenter {
  const sorted = [...input.chains].sort((a, b) => b.score - a.score);
  const groups: OpportunityGroup[] = (["high", "medium", "low"] as PriorityBand[]).map((band) => ({
    band, label: BAND_LABEL[band], chains: sorted.filter((c) => bandOf(c.score) === band),
  })).filter((g) => g.chains.length > 0);
  return {
    groups,
    totals: {
      total: input.chains.length,
      potentialDeals: input.chains.filter((c) => c.type === "potential_deal").length,
      expansion: input.chains.filter((c) => c.type === "defend_market" || c.type === "capacity_reallocation" || c.type === "reengage_stale").length,
    },
  };
}

// ── Part 4 — Risk center ────────────────────────────────────────────────────
function buildRisks(input: HomeInput): RiskCenter {
  const criticalSellers = input.pipelines.sellers.items.filter((e) => e.tone === "bad" || e.tone === "warn").slice(0, 6);
  const criticalListings = input.pipelines.listings.items.filter((e) => e.tone === "bad" || e.tone === "warn").slice(0, 6);
  const decliningBrokers = input.office?.inactiveBrokers.slice(0, 6) ?? [];
  const lostOpportunities = input.signals.criticalRisks.filter((r) => /החמצ|אובד|נטישה|לא פעיל/.test(r.title)).map((r) => r.title).slice(0, 6);
  const dqIssues: string[] = [];
  if (input.office && input.office.dataQuality < 60) dqIssues.push(`איכות נתונים ${input.office.dataQuality}`);
  for (const r of input.signals.criticalRisks) if (/נתונים|כיסוי|שיוך/.test(r.title)) dqIssues.push(r.title);
  const score = clamp(
    input.signals.criticalRisks.length * 12 + criticalSellers.length * 8 + criticalListings.length * 6 + decliningBrokers.length * 5,
  );
  return { criticalSellers, criticalListings, decliningBrokers, lostOpportunities, dataQualityIssues: [...new Set(dqIssues)].slice(0, 6), score };
}

// ── Part 5 — Execution center ───────────────────────────────────────────────
function buildExecution(input: HomeInput): ExecutionCenter {
  const approvals = input.inbox.filter((i) => i.status === "pending").sort((a, b) => b.confidence - a.confidence);
  return {
    approvals: approvals.slice(0, 10),
    waitingMissions: input.missions.waitingItems.slice(0, 10),
    todaysActions: input.missions.todayItems.slice(0, 10),
    recentlyCompleted: input.missions.completedItems.slice(0, 10),
    totals: { approvals: approvals.length, waiting: input.missions.waiting, today: input.missions.today, completed: input.missions.completed },
  };
}

// ── Part 6 — AI insights ────────────────────────────────────────────────────
function buildInsights(input: HomeInput): AiInsights {
  return {
    briefingSummary: input.signals.briefingSummary || "אין תדריך זמין עדיין.",
    businessScore: clamp(input.signals.businessScore),
    suggestedActions: input.signals.suggestedActions.slice(0, 6),
    suggestedQuestions: input.suggestedQuestions.slice(0, 6),
  };
}

// ── Part 7 — Smart timeline (already merged upstream; sort + cap here) ───────
function buildTimeline(input: HomeInput): HomeTimelineEvent[] {
  return [...input.timeline]
    .filter((e) => !!e.at)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 40);
}

export function buildAiHome(input: HomeInput): AiHomeData {
  const today = buildToday(input);
  const opportunities = buildOpportunities(input);
  const risks = buildRisks(input);
  const execution = buildExecution(input);
  const insights = buildInsights(input);
  const timeline = buildTimeline(input);

  const emptyState =
    input.signals.priorities.length === 0 && input.chains.length === 0 &&
    input.missions.waiting + input.missions.today + input.missions.completed === 0 &&
    input.pipelines.buyers.total + input.pipelines.sellers.total + input.pipelines.listings.total === 0;

  const notes: string[] = [];
  if (emptyState) notes.push("אין עדיין נתונים במערכת — התחל בהוספת קונים/מוכרים/נכסים או הפעל את הסוכנים. אין המצאות.");

  return {
    version: "30.2", generatedAt: new Date().toISOString(),
    today, opportunities, risks, execution, insights, timeline, emptyState, notes,
  };
}

// ── Part 8 — context panel from a card the user selected (no new fetch) ─────
export function buildContextPanel(ref: { kind: string; id: string; name: string }, input: HomeInput): ContextPanelData {
  const inPipe = [
    ...input.pipelines.buyers.items, ...input.pipelines.sellers.items, ...input.pipelines.listings.items,
  ].find((e) => e.id === ref.id && e.kind === ref.kind);
  const openMissions: MissionRef[] = [...input.missions.waitingItems, ...input.missions.todayItems].filter((m) => m.entity.includes(ref.name));
  const risks: string[] = [];
  const opportunities: string[] = [];
  if (inPipe) { if (inPipe.tone === "bad" || inPipe.tone === "warn") risks.push(inPipe.detail); else opportunities.push(inPipe.detail); }
  for (const c of input.chains) if (c.links.some((l) => l.includes(ref.name))) opportunities.push(c.title);
  return {
    kind: ref.kind, id: ref.id, name: ref.name,
    summary: inPipe?.detail ?? "פרטי ישות מתוך הלוחות.",
    health: inPipe?.score ?? null,
    risks: [...new Set(risks)].slice(0, 5), opportunities: [...new Set(opportunities)].slice(0, 5),
    truth: null, relationships: [], openMissions: openMissions.slice(0, 5),
  };
}

export { bandOf };
