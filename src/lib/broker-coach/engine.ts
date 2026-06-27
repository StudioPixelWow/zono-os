// ============================================================================
// Evidence-Based Broker Coach™ — MAI-11 engine (PURE, deterministic).
//
// Generates STRUCTURED, evidence-backed coaching from the MAI-10 gap profiles
// (+ MAI-9 Winning DNA, MAI-7 leaders, MAI-6 context they carry). It never
// invents, never guesses, never gives unsupported advice: every recommendation
// references the exact observed evidence that produced it, and segments with
// insufficient evidence yield "Not enough evidence". No LLM, no randomness, no
// free text.
// ============================================================================
import {
  COACH_MIN_PROFILE_CONFIDENCE,
  type BrokerCoachInput, type BrokerCoachResult, type CoachRecommendation,
  type CoachInsight, type CoachEvidence, type CoachCategory, type ImpactLevel, type PriorityBand,
  type CoachGap, type DailyCoach,
} from "./types";

const round = (v: number, dp = 0): number => { const f = 10 ** dp; return Math.round(v * f) / f; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (frac: number | null): string => (frac == null ? "—" : `${Math.round(frac * 100)}%`);
const sevRank = (s: "LOW" | "MEDIUM" | "HIGH"): number => (s === "HIGH" ? 1 : s === "MEDIUM" ? 0.66 : 0.33);
const impactRank = (i: ImpactLevel): number => (i === "HIGH" ? 1 : i === "MEDIUM" ? 0.66 : 0.33);
const band = (p: number): PriorityBand => (p >= 66 ? "HIGH" : p >= 33 ? "MEDIUM" : "LOW");

interface GapMeta { category: CoachCategory; title: string; sources: string[]; evidence: (g: CoachGap, seg: string) => string }
const GAP_META: Record<CoachGap["type"], GapMeta> = {
  EXIT_SPEED: {
    category: "PERFORMANCE", title: "שיפור מהירות היציאה מהשוק",
    sources: ["broker_gap_analysis.exit_speed_gap_days", "broker_winning_dna.median_days_on_market"],
    evidence: (g, seg) => `חציון הימים בשוק הוא ${num(g.brokerValue)} לעומת ${num(g.benchmarkValue)} בדפוס המנצח (פער ${num(g.gapValue)} ימים) — ${seg}`,
  },
  SUCCESS_RATE: {
    category: "PERFORMANCE", title: "שיפור שיעור הצלחת השוק",
    sources: ["broker_gap_analysis.success_rate_gap", "broker_winning_dna.market_success_rate"],
    evidence: (g, seg) => `שיעור ההצלחה המשוער ${pct(g.brokerValue)} לעומת ${pct(g.benchmarkValue)} בדפוס המנצח (פער ${Math.round((g.gapValue ?? 0) * 100)} נק׳ אחוז) — ${seg}`,
  },
  MARKET_SHARE: {
    category: "MARKET_POSITION", title: "הגדלת נתח השוק",
    sources: ["broker_gap_analysis.market_share_gap", "market_area_leaders.active_listing_share"],
    evidence: (g, seg) => `נתח הנכסים הפעילים נמוך ב-${Math.round((g.gapValue ?? 0) * 100)}% מהמובילה — ${seg}`,
  },
  ACTIVITY: {
    category: "ACTIVITY", title: "הגדלת נפח הפעילות",
    sources: ["broker_gap_analysis.activity_gap", "broker_winning_dna.activity_patterns"],
    evidence: (g, seg) => `נפח הפעילות נמוך ב-${num(g.gapValue)} ביחס לדפוס המנצח — ${seg}`,
  },
  PERFORMANCE: {
    category: "PERFORMANCE", title: "שיפור מדד הביצועים",
    sources: ["broker_gap_analysis.performance_gap", "broker_winning_dna.market_dominance"],
    evidence: (g, seg) => `מדד הביצועים נמוך ב-${num(g.gapValue)} נקודות מהדפוס המנצח — ${seg}`,
  },
  MOMENTUM: {
    category: "MOMENTUM", title: "חיזוק המומנטום",
    sources: ["broker_gap_analysis.momentum_gap", "market_area_leaders.market_momentum_index"],
    evidence: (g, seg) => `המומנטום נמוך ב-${num(g.gapValue)} מהמובילים באזור — ${seg}`,
  },
  COVERAGE: {
    category: "COVERAGE", title: "הרחבת הכיסוי בשכונות/קטגוריות מנצחות",
    sources: ["broker_gap_analysis.coverage_gap", "broker_winning_dna.listing_patterns"],
    evidence: (g, seg) => `כיסוי חלקי של ${num(g.gapValue)} שכונות/קטגוריות מנצחות — ${seg}`,
  },
  PRICE_REDUCTION: {
    category: "PRICING", title: "הקטנת הורדות המחיר",
    sources: ["broker_gap_analysis.price_reduction_gap", "broker_winning_dna.pricing_patterns"],
    evidence: (g, seg) => `הורדות המחיר גבוהות ב-${Math.round((g.gapValue ?? 0) * 100)}% מהדפוס המנצח — ${seg}`,
  },
};
const num = (v: number | null): string => (v == null ? "—" : `${round(v, 1)}`);

const CATEGORY_TITLES: CoachCategory[] = ["PERFORMANCE", "MARKET_POSITION", "GAP_CLOSING", "COVERAGE", "PRICING", "ACTIVITY", "MOMENTUM", "MARKET_OPPORTUNITIES", "RISK", "STRENGTH_REINFORCEMENT"];

/** Compute evidence-based coaching for every broker. Pure + deterministic. */
export function computeBrokerCoach(inputs: BrokerCoachInput[]): BrokerCoachResult[] {
  const out: BrokerCoachResult[] = [];
  for (const input of inputs) {
    if (!input.brokerId) continue; // no broker → ignored safely
    out.push(coachBroker(input));
  }
  out.sort((a, b) => a.brokerId.localeCompare(b.brokerId));
  return out;
}

function coachBroker(input: BrokerCoachInput): BrokerCoachResult {
  const usable = input.gapProfiles.filter(
    (p) => p.confidence >= COACH_MIN_PROFILE_CONFIDENCE && (p.gaps.length > 0 || p.strengths.length > 0 || p.zoneDominanceScore != null),
  );

  if (!usable.length) return notEnoughEvidence(input.brokerId);

  // Focus profile: highest confidence, then highest zone dominance, then segment.
  const focus = [...usable].sort(
    (a, b) => b.confidence - a.confidence || (b.zoneDominanceScore ?? 0) - (a.zoneDominanceScore ?? 0) || a.segmentLabel.localeCompare(b.segmentLabel),
  )[0];

  // Aggregate the most severe instance of each gap type across all segments.
  const repByType = new Map<CoachGap["type"], { gap: CoachGap; segment: string }>();
  for (const p of usable) {
    for (const g of p.gaps) {
      if (g.gapValue == null || g.gapValue <= 0) continue;
      const score = sevRank(g.severity) * clamp(g.confidence, 0, 1);
      const cur = repByType.get(g.type);
      const curScore = cur ? sevRank(cur.gap.severity) * clamp(cur.gap.confidence, 0, 1) : -1;
      if (score > curScore || (score === curScore && (!cur || p.segmentLabel.localeCompare(cur.segment) < 0))) {
        repByType.set(g.type, { gap: g, segment: p.segmentLabel });
      }
    }
  }

  const oppW = clamp(1 - (focus.leaderGap ?? 50) / 100, 0.3, 1);
  const dqW = clamp(focus.confidence / 100, 0, 1);
  const evidence: CoachEvidence[] = [];

  // ── Recommendations from measurable gaps ───────────────────────────────────
  const recommendations: CoachRecommendation[] = [];
  for (const [type, { gap, segment }] of repByType) {
    const meta = GAP_META[type];
    const impact: ImpactLevel = gap.severity === "HIGH" ? "HIGH" : gap.severity === "MEDIUM" ? "MEDIUM" : "LOW";
    const confidence = round(clamp(gap.confidence, 0, 1) * 100);
    const priority = round(100 * impactRank(impact) * clamp(gap.confidence, 0, 1) * sevRank(gap.severity) * oppW * dqW);
    const ev = meta.evidence(gap, segment);
    evidence.push({ label: ev, source: meta.sources[0], brokerValue: gap.brokerValue, benchmarkValue: gap.benchmarkValue, gapValue: gap.gapValue, segment });
    recommendations.push({
      id: `rec:${meta.category}:${type}`, priority, priorityBand: band(priority),
      category: meta.category, title: meta.title,
      summary: `${meta.title} — מבוסס על פער מדיד מול הדפוס המנצח (${segment}).`,
      confidence, estimatedImpact: impact,
      supportingEvidence: [ev],
      blockedBy: gap.confidence < 0.4 ? ["low_confidence_evidence"] : [],
      generatedFrom: meta.sources,
    });
  }

  // ── Leader-gap closing (Gap Closing) when far from the leader ──────────────
  if (focus.leaderGap != null && focus.leaderGap >= 20) {
    const impact: ImpactLevel = focus.leaderGap >= 40 ? "HIGH" : "MEDIUM";
    const conf = round(dqW * 100);
    const priority = round(100 * impactRank(impact) * dqW * 0.8 * clamp(focus.leaderGap / 100, 0.2, 1) * dqW);
    const ev = `פער של ${Math.round(focus.leaderGap)} נקודות שליטה מהמובילה באזור ${focus.segmentLabel}`;
    evidence.push({ label: ev, source: "broker_gap_analysis.leader_gap", gapValue: focus.leaderGap, segment: focus.segmentLabel });
    recommendations.push({
      id: "rec:GAP_CLOSING:LEADER", priority, priorityBand: band(priority), category: "GAP_CLOSING",
      title: "צמצום הפער מהמובילה באזור",
      summary: `המתווך מאחורי המובילה ב-${Math.round(focus.leaderGap)} נקודות שליטה (${focus.segmentLabel}).`,
      confidence: conf, estimatedImpact: impact, supportingEvidence: [ev], blockedBy: [],
      generatedFrom: ["broker_gap_analysis.leader_gap", "market_area_leaders.market_dominance_index"],
    });
  }

  // ── Warnings (RISK) ─────────────────────────────────────────────────────────
  const warnings: CoachRecommendation[] = [];
  if (focus.leaderGap != null && focus.leaderGap >= 40) {
    const ev = `המובילה מרחיבה פער של ${Math.round(focus.leaderGap)} נקודות שליטה (${focus.segmentLabel})`;
    evidence.push({ label: ev, source: "broker_gap_analysis.leader_gap", gapValue: focus.leaderGap, segment: focus.segmentLabel });
    warnings.push(mkSimple("warn:RISK:LEADER_GAP", "RISK", "סיכון: התרחבות הפער מהמובילה", ev, "HIGH", round(dqW * 100), ["broker_gap_analysis.leader_gap"], oppW, dqW));
  }
  if (focus.momentum <= -5) {
    const ev = `מומנטום יורד (${round(focus.momentum, 1)}) ב${focus.segmentLabel}`;
    evidence.push({ label: ev, source: "broker_gap_analysis.metadata.brokerMomentum", gapValue: focus.momentum, segment: focus.segmentLabel });
    warnings.push(mkSimple("warn:RISK:MOMENTUM", "RISK", "סיכון: מומנטום יורד", ev, "MEDIUM", round(dqW * 100), ["broker_gap_analysis.momentum_gap"], oppW, dqW));
  }

  // ── Opportunities (MARKET_OPPORTUNITIES) ───────────────────────────────────
  const opportunities: CoachRecommendation[] = [];
  if (focus.leaderGap != null && focus.leaderGap > 0 && focus.leaderGap <= 20 && (focus.zoneDominanceScore ?? 0) >= 50) {
    const ev = `קרוב למובילות: פער ${Math.round(focus.leaderGap)} נקודות בלבד וציון שליטה ${Math.round(focus.zoneDominanceScore ?? 0)} (${focus.segmentLabel})`;
    evidence.push({ label: ev, source: "broker_gap_analysis.zone_dominance_score", gapValue: focus.leaderGap, segment: focus.segmentLabel });
    const blockedBy = repByType.has("MARKET_SHARE") ? ["gap:MARKET_SHARE"] : [];
    opportunities.push({
      id: "opp:MARKET_OPPORTUNITIES:NEAR_LEADERSHIP", priority: round(100 * impactRank("HIGH") * dqW * oppW * 0.9 * dqW),
      priorityBand: band(round(100 * impactRank("HIGH") * dqW * oppW * 0.9 * dqW)), category: "MARKET_OPPORTUNITIES",
      title: "הזדמנות לתפיסת מובילות באזור", summary: `המתווך קרוב למובילות ב${focus.segmentLabel}.`,
      confidence: round(dqW * 100), estimatedImpact: "HIGH", supportingEvidence: [ev], blockedBy,
      generatedFrom: ["broker_gap_analysis.zone_dominance_score", "market_area_leaders.leader_gap"],
    });
  }
  if ((focus.winningDnaMatchScore ?? 0) >= 80 && repByType.has("MARKET_SHARE")) {
    const ev = `התאמה גבוהה לדפוס המנצח (${Math.round(focus.winningDnaMatchScore ?? 0)}%) אך נתח שוק נמוך — ${focus.segmentLabel}`;
    evidence.push({ label: ev, source: "broker_gap_analysis.winning_dna_match_score", segment: focus.segmentLabel });
    opportunities.push(mkSimple("opp:MARKET_OPPORTUNITIES:SCALE_WINNING", "MARKET_OPPORTUNITIES", "הזדמנות להרחבה באזור מנצח", ev, "MEDIUM", round(dqW * 100), ["broker_gap_analysis.winning_dna_match_score", "broker_winning_dna.winning_profile"], oppW, dqW));
  }

  // ── Strength reinforcement ─────────────────────────────────────────────────
  const strengths: CoachRecommendation[] = [];
  const seenStrength = new Set<string>();
  for (const p of usable) {
    for (const s of p.strengths) {
      if (seenStrength.has(s.type)) continue;
      seenStrength.add(s.type);
      const ev = `${s.label} (${p.segmentLabel})`;
      evidence.push({ label: ev, source: "broker_gap_analysis.strengths", segment: p.segmentLabel });
      strengths.push({
        id: `str:STRENGTH_REINFORCEMENT:${s.type}`, priority: round(100 * impactRank("LOW") * 0.4 * dqW * dqW),
        priorityBand: "LOW", category: "STRENGTH_REINFORCEMENT", title: `חיזוק יתרון: ${s.label}`,
        summary: `יתרון נצפה מול הדפוס המנצח (${p.segmentLabel}).`, confidence: round(dqW * 100),
        estimatedImpact: "LOW", supportingEvidence: [ev], blockedBy: [], generatedFrom: ["broker_gap_analysis.strengths"],
      });
    }
  }

  // ── Insights (factual observations, never advice) ──────────────────────────
  const insights: CoachInsight[] = [{
    id: "ins:zone_dominance", category: "MARKET_POSITION",
    title: "מצב שליטה באזור",
    detail: `ציון שליטה ${focus.zoneDominanceScore == null ? "לא זמין" : Math.round(focus.zoneDominanceScore)} (${focus.zoneDominanceLevel}) ב${focus.segmentLabel}; התאמה לדפוס המנצח ${focus.winningDnaMatchScore == null ? "—" : Math.round(focus.winningDnaMatchScore) + "%"}.`,
    confidence: round(focus.confidence), generatedFrom: ["broker_gap_analysis.zone_dominance_score", "broker_gap_analysis.winning_dna_match_score"],
  }];

  // ── Rank + assemble ────────────────────────────────────────────────────────
  recommendations.sort((a, b) => b.priority - a.priority || a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  opportunities.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  warnings.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  const allConf = [...recommendations, ...warnings, ...opportunities].map((r) => r.confidence);
  const overallConfidence = round(mean(allConf) ?? focus.confidence);
  const overallPriority: PriorityBand = recommendations.length ? recommendations[0].priorityBand : (warnings.length ? warnings[0].priorityBand : "NONE");

  const trend = focus.momentum > 5 ? "UP" : focus.momentum < -5 ? "DOWN" : "FLAT";
  const dailyCoach: DailyCoach = {
    topPriorities: recommendations.slice(0, 3).map((r) => r.id),
    opportunities: opportunities.map((o) => o.id),
    risks: warnings.map((w) => w.id),
    wins: strengths.map((s) => s.id),
    weeklyTrend: trend, zoneDominanceTrend: trend,
    trendBasis: "מבוסס על מומנטום תוך-ריצה (חלון אחרון מול טווח ארוך) — אינו סדרת זמן היסטורית.",
  };

  return {
    brokerId: input.brokerId, overallPriority, overallConfidence,
    recommendations, insights, warnings, opportunities, strengths, evidence, dailyCoach,
    metadata: {
      focusSegment: focus.segmentLabel, focusWindowDays: focus.windowDays,
      zoneDominanceScore: focus.zoneDominanceScore, zoneDominanceLevel: focus.zoneDominanceLevel,
      usableProfiles: usable.length, categories: CATEGORY_TITLES,
    },
  };
}

function mkSimple(
  id: string, category: CoachCategory, title: string, ev: string, impact: ImpactLevel,
  confidence: number, sources: string[], oppW: number, dqW: number,
): CoachRecommendation {
  const priority = round(100 * impactRank(impact) * (confidence / 100) * (category === "RISK" ? 0.9 : 0.7) * oppW * dqW);
  return {
    id, priority, priorityBand: band(priority), category, title,
    summary: ev, confidence, estimatedImpact: impact, supportingEvidence: [ev], blockedBy: [], generatedFrom: sources,
  };
}

function notEnoughEvidence(brokerId: string): BrokerCoachResult {
  return {
    brokerId, overallPriority: "NONE", overallConfidence: 0,
    recommendations: [], warnings: [], opportunities: [], strengths: [],
    insights: [{
      id: "ins:not_enough_evidence", category: "MARKET_POSITION", title: "Not enough evidence",
      detail: "אין כרגע מספיק עדויות שוק נצפות כדי להפיק אימון מבוסס-ראיות עבור מתווך זה.",
      confidence: 0, generatedFrom: ["broker_gap_analysis"],
    }],
    evidence: [],
    dailyCoach: { topPriorities: [], opportunities: [], risks: [], wins: [], weeklyTrend: "FLAT", zoneDominanceTrend: "FLAT", trendBasis: "אין מספיק נתונים." },
    metadata: { notEnoughEvidence: true },
  };
}
