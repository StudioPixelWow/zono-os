// ============================================================================
// Autonomous Growth Strategy™ — MAI-12 engine (PURE, deterministic).
//
// Converts MAI-11 coach items (each evidence-backed) into a structured
// execution plan: actions mapped to categories + time buckets, ranked by a
// transparent 5-factor priority, with blockers (low confidence / missing data /
// conflicting evidence) removed from the active plan, plus a clearly-marked
// Zone Dominance SIMULATION. It never invents strategy: every action carries
// its required evidence + source. No LLM, no randomness, no free text.
// ============================================================================
import {
  STRATEGY_MIN_ACTION_CONFIDENCE, MAX_GAIN_PER_ACTION, MAX_TOTAL_IMPROVEMENT,
  type StrategyInput, type BrokerStrategyResult, type StrategyAction, type StrategyEvidence,
  type ActionCategory, type TimeToImpact, type ImpactLevel, type PriorityBand,
  type StrategyGapType, type GapSeverity, type SimMetric,
} from "./types";

const round = (v: number, dp = 0): number => { const f = 10 ** dp; return Math.round(v * f) / f; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const impactRank = (i: ImpactLevel): number => (i === "HIGH" ? 1 : i === "MEDIUM" ? 0.66 : 0.33);
const sevRank = (s: GapSeverity): number => (s === "HIGH" ? 1 : s === "MEDIUM" ? 0.66 : 0.33);
const band = (p: number): PriorityBand => (p >= 66 ? "HIGH" : p >= 33 ? "MEDIUM" : "LOW");

const DISCLAIMER = "סימולציה בלבד — הערכה מבוססת ראיות, אינה הבטחה.";

/** Map a coach-item gap type → action category + time-to-impact. */
const TYPE_MAP: Record<StrategyGapType, { category: ActionCategory; time: TimeToImpact }> = {
  EXIT_SPEED: { category: "Exit Speed", time: "DAILY" },
  PRICE_REDUCTION: { category: "Pricing", time: "DAILY" },
  ACTIVITY: { category: "Activity", time: "DAILY" },
  SUCCESS_RATE: { category: "Market Presence", time: "WEEKLY" },
  MARKET_SHARE: { category: "Listing Acquisition", time: "WEEKLY" },
  COVERAGE: { category: "Coverage", time: "WEEKLY" },
  MOMENTUM: { category: "Market Presence", time: "WEEKLY" },
  NEAR_LEADERSHIP: { category: "Market Opportunity", time: "WEEKLY" },
  PERFORMANCE: { category: "Competitive Position", time: "MONTHLY" },
  LEADER: { category: "Competitive Position", time: "MONTHLY" },
  SCALE_WINNING: { category: "Neighborhood Focus", time: "MONTHLY" },
  OTHER: { category: "Market Presence", time: "WEEKLY" },
};

/** Parse the gap TYPE out of a coach-item id (`rec:CATEGORY:TYPE`, `opp:..:TYPE`). */
function gapTypeOf(id: string): StrategyGapType {
  const tail = id.split(":").pop() ?? "";
  const known: StrategyGapType[] = ["EXIT_SPEED", "SUCCESS_RATE", "MARKET_SHARE", "ACTIVITY", "PERFORMANCE", "MOMENTUM", "COVERAGE", "PRICE_REDUCTION", "LEADER", "NEAR_LEADERSHIP", "SCALE_WINNING"];
  return known.find((k) => tail === k || tail.startsWith(k)) ?? "OTHER";
}

/** Compute growth strategies for every broker. Pure + deterministic. */
export function computeBrokerStrategy(inputs: StrategyInput[]): BrokerStrategyResult[] {
  const out: BrokerStrategyResult[] = [];
  for (const input of inputs) {
    if (!input.brokerId) continue; // no broker → ignored safely
    out.push(strategize(input));
  }
  out.sort((a, b) => a.brokerId.localeCompare(b.brokerId));
  return out;
}

function strategize(input: StrategyInput): BrokerStrategyResult {
  const currentZone = input.currentZoneScore;
  const oppW = clamp(1 - (input.currentLeaderGap ?? 50) / 100, 0.3, 1);          // closer to leader ⇒ bigger opportunity
  const timingW = input.momentum > 5 ? 1 : input.momentum < -5 ? 0.7 : 0.85;    // ride positive momentum

  const evidence: StrategyEvidence[] = [];
  const actions: StrategyAction[] = [];

  for (const item of input.coachItems) {
    const relatedGap = gapTypeOf(item.id);
    const map = TYPE_MAP[relatedGap];
    const severity: GapSeverity = input.gapSeverityByType[relatedGap] ?? (item.estimatedImpact === "HIGH" ? "HIGH" : item.estimatedImpact === "MEDIUM" ? "MEDIUM" : "LOW");

    // ── Blocker detection ──────────────────────────────────────────────────
    const blockedBy: string[] = [...item.blockedBy];
    if (item.confidence < STRATEGY_MIN_ACTION_CONFIDENCE) blockedBy.push("low_confidence");
    if (!item.supportingEvidence.length || !item.generatedFrom.length) blockedBy.push("missing_evidence");
    // Conflict: a gap of a type the broker is already strong in (contradictory).
    if (item.kind === "recommendation" && input.strengthTypes.includes(relatedGap)) blockedBy.push("conflicting_evidence");

    const confW = clamp(item.confidence, 0, 100) / 100;
    const priority = round(100 * impactRank(item.estimatedImpact) * confW * sevRank(severity) * oppW * timingW);
    const estimatedZoneScoreGain = round(impactRank(item.estimatedImpact) * confW * MAX_GAIN_PER_ACTION, 1);

    for (const ev of item.supportingEvidence) evidence.push({ label: ev, source: item.generatedFrom[0] ?? "broker_ai_coaching", relatedGap });

    actions.push({
      id: item.id.replace(/^(rec|opp|warn):/, "act:"),
      title: item.title, category: map.category, priority, priorityBand: band(priority),
      confidence: round(item.confidence), estimatedImpact: item.estimatedImpact,
      estimatedZoneScoreGain, estimatedTimeToImpact: map.time,
      requiredEvidence: item.supportingEvidence, relatedGap, generatedFrom: item.generatedFrom,
      blockedBy: [...new Set(blockedBy)],
    });
  }

  // Deterministic ranking.
  actions.sort((a, b) => b.priority - a.priority || a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

  const active = actions.filter((a) => a.blockedBy.length === 0);
  const blocked = actions.filter((a) => a.blockedBy.length > 0);

  const daily = active.filter((a) => a.estimatedTimeToImpact === "DAILY");
  const weekly = active.filter((a) => a.estimatedTimeToImpact === "WEEKLY");
  const monthly = active.filter((a) => a.estimatedTimeToImpact === "MONTHLY");
  const quickWins = active.filter((a) => a.estimatedTimeToImpact !== "MONTHLY" && a.confidence >= 65 && a.estimatedImpact !== "LOW");
  const longTerm = active.filter((a) => a.estimatedTimeToImpact === "MONTHLY" || a.estimatedImpact === "HIGH");

  // ── Zone Dominance SIMULATION (estimate, never a guarantee) ───────────────
  const baseZone = currentZone ?? 50;
  const totalGain = round(clamp(active.slice(0, 5).reduce((s, a) => s + a.estimatedZoneScoreGain, 0), 0, MAX_TOTAL_IMPROVEMENT), 1);
  const expectedZone = active.length ? round(clamp(baseZone + totalGain, 0, 95), 1) : (currentZone == null ? null : round(baseZone, 1));
  const expectedImprovement = expectedZone == null || currentZone == null ? (active.length ? totalGain : 0) : round(expectedZone - currentZone, 1);

  const hasShareAction = active.some((a) => a.relatedGap === "MARKET_SHARE" || a.category === "Listing Acquisition");
  const hasSuccessAction = active.some((a) => a.relatedGap === "SUCCESS_RATE" || a.relatedGap === "ACTIVITY");
  const marketShare: SimMetric | null = input.currentMarketShare != null && hasShareAction
    ? simMetric(input.currentMarketShare, clamp(input.currentMarketShare + 0.04 * meanConf(active), 0, 1))
    : null;
  const successRate: SimMetric | null = input.currentSuccessRate != null && hasSuccessAction
    ? simMetric(input.currentSuccessRate, clamp(input.currentSuccessRate + 0.05 * meanConf(active), 0, 1))
    : null;

  const overallConfidence = round(mean(active.map((a) => a.confidence)) ?? 0);
  const overallPriority: PriorityBand = active.length ? active[0].priorityBand : "NONE";
  const notEnoughEvidence = active.length === 0;

  return {
    brokerId: input.brokerId, overallPriority, overallConfidence,
    expectedZoneScore: expectedZone, expectedImprovement,
    dailyActions: daily, weeklyActions: weekly, monthlyActions: monthly,
    quickWins, longTermActions: longTerm, blockedActions: blocked,
    estimatedImpact: {
      simulation: true, disclaimer: DISCLAIMER,
      zoneDominance: simMetric(currentZone, expectedZone),
      marketShare, successRate,
    },
    evidence,
    metadata: {
      notEnoughEvidence, activeCount: active.length, blockedCount: blocked.length,
      timingFactor: round(timingW, 2), opportunityFactor: round(oppW, 2),
    },
  };
}

function simMetric(current: number | null, expected: number | null): SimMetric {
  const delta = current == null || expected == null ? null : round(expected - current, 4);
  return { current: current == null ? null : round(current, 4), expected: expected == null ? null : round(expected, 4), delta };
}
function meanConf(active: { confidence: number }[]): number {
  return active.length ? clamp((active.reduce((s, a) => s + a.confidence, 0) / active.length) / 100, 0, 1) : 0;
}
