/**
 * Team Intelligence Engine — deterministic, AI-ready brokerage performance.
 * Pure, client-safe, no LLM, no server imports. Turns per-agent activity +
 * forecast + communication signals into performance scores, tiers, office
 * health, coaching signals, territory coverage and workload balance.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

// ── Inputs ───────────────────────────────────────────────────────────────────
export interface AgentMetrics {
  userId: string;
  name: string;
  // Pipeline / book of business
  activeLeads: number;
  activeBuyers: number;
  activeSellers: number;
  activeProperties: number;
  activeMatches: number;
  activeTasks: number;
  // Outcomes
  wonDeals: number;
  lostDeals: number;
  totalLeadsHandled: number;
  totalRevenue: number;
  avgDaysToClose: number | null;
  avgResponseMinutes: number | null;
  recentDeals90d: number;
  recentDealsPrev90d: number;
  // Forecast (probability-weighted) from deal_forecasts
  forecastRevenue: number;
  likelyCloses: number;
  atRiskDeals: number;
  // Communication health (from communication_intelligence_profiles)
  avgCommHealth: number | null;
  missedFollowups: number;
  openCommitments: number;
  // Coverage
  localityCount: number;
  propertyTypeCount: number;
  // Office reference points (computed across the team)
  maxRevenue: number;
  maxForecastRevenue: number;
  avgActiveLoad: number;
}

export interface TeamScores {
  performance_score: number;
  revenue_score: number;
  conversion_score: number;
  activity_score: number;
  responsiveness_score: number;
  workload_score: number;
  forecast_score: number;
  client_satisfaction_score: number;
  reliability_score: number;
  coaching_score: number;
}

// ── 8 score functions (per spec) ─────────────────────────────────────────────
export function calculateRevenueScore(m: AgentMetrics): number {
  // Relative to the office's strongest revenue producer, blended with absolute
  // closed-deal volume so a one-deal office doesn't trivially score 100.
  const rel = m.maxRevenue > 0 ? pct(m.totalRevenue, m.maxRevenue) : 0;
  const volume = Math.min(100, m.wonDeals * 12);
  return clamp(rel * 0.65 + volume * 0.35);
}

export function calculateConversionScore(m: AgentMetrics): number {
  const total = m.wonDeals + m.lostDeals;
  // Win rate among decided deals + lead→deal conversion.
  const winRate = total > 0 ? pct(m.wonDeals, total) : 0;
  const leadConv = m.totalLeadsHandled > 0 ? Math.min(100, pct(m.wonDeals, m.totalLeadsHandled) * 4) : 0;
  if (total === 0 && m.totalLeadsHandled === 0) return 0;
  return clamp(winRate * 0.6 + leadConv * 0.4);
}

export function calculateActivityScore(m: AgentMetrics): number {
  // Active book of business relative to the office average load.
  const load = m.activeLeads + m.activeBuyers + m.activeSellers + m.activeProperties + m.activeMatches;
  const rel = m.avgActiveLoad > 0 ? pct(load, m.avgActiveLoad) : (load > 0 ? 60 : 0);
  // Recent momentum: deals closed in the last 90 days.
  const momentum = Math.min(100, m.recentDeals90d * 25);
  return clamp(Math.min(100, rel) * 0.6 + momentum * 0.4);
}

export function calculateResponsivenessScore(m: AgentMetrics): number {
  // Faster response = higher score. Communication health reinforces it.
  let base = 60;
  if (m.avgResponseMinutes != null) {
    base = m.avgResponseMinutes <= 15 ? 95 : m.avgResponseMinutes <= 60 ? 85 : m.avgResponseMinutes <= 180 ? 70 : m.avgResponseMinutes <= 480 ? 55 : m.avgResponseMinutes <= 1440 ? 40 : 25;
  } else if (m.avgCommHealth != null) {
    base = m.avgCommHealth;
  }
  if (m.avgCommHealth != null) base = base * 0.6 + m.avgCommHealth * 0.4;
  if (m.missedFollowups > 0) base -= Math.min(25, m.missedFollowups * 6);
  return clamp(base);
}

export function calculateWorkloadScore(m: AgentMetrics): number {
  // Higher score = MORE available capacity (less overloaded). Balanced load
  // around the office average is ideal; far above average = overloaded (low).
  const load = m.activeLeads + m.activeBuyers + m.activeSellers + m.activeProperties + m.activeMatches + m.activeTasks;
  if (m.avgActiveLoad <= 0) return load > 0 ? 60 : 100;
  const ratio = load / (m.avgActiveLoad + m.activeTasks * 0 + 0.0001);
  // ratio ~1 → balanced (75); ratio >> 1 → overloaded (low); ratio << 1 → idle (high capacity)
  if (ratio >= 1.8) return clamp(20);
  if (ratio >= 1.4) return clamp(38);
  if (ratio >= 1.1) return clamp(60);
  if (ratio >= 0.7) return clamp(80);
  if (ratio >= 0.3) return clamp(90);
  return clamp(100);
}

export function calculateForecastScore(m: AgentMetrics): number {
  const rel = m.maxForecastRevenue > 0 ? pct(m.forecastRevenue, m.maxForecastRevenue) : 0;
  const likely = Math.min(100, m.likelyCloses * 22);
  let s = rel * 0.6 + likely * 0.4;
  if (m.atRiskDeals > 0 && m.likelyCloses + m.atRiskDeals > 0) s -= Math.min(20, pct(m.atRiskDeals, m.likelyCloses + m.atRiskDeals) * 0.2);
  return clamp(s);
}

export function calculateReliabilityScore(m: AgentMetrics): number {
  // Kept commitments + consistent recent production + low followup misses.
  let s = 80;
  if (m.openCommitments > 0) s -= Math.min(30, m.openCommitments * 8);
  if (m.missedFollowups > 0) s -= Math.min(25, m.missedFollowups * 7);
  // Consistency: recent 90d vs prior 90d production.
  if (m.recentDealsPrev90d > 0) {
    const cons = pct(m.recentDeals90d, m.recentDealsPrev90d);
    if (cons >= 80) s += 8; else if (cons < 50) s -= 10;
  }
  return clamp(s);
}

export function calculateClientSatisfactionScore(m: AgentMetrics): number {
  // Proxy from communication health + responsiveness + low broken commitments.
  let s = m.avgCommHealth != null ? m.avgCommHealth : 60;
  if (m.avgResponseMinutes != null && m.avgResponseMinutes <= 60) s += 8;
  if (m.openCommitments > 2) s -= 10;
  if (m.missedFollowups > 2) s -= 8;
  return clamp(s);
}

export function calculatePerformanceScore(s: Omit<TeamScores, "performance_score" | "coaching_score">): number {
  return clamp(
    s.revenue_score * 0.26 +
    s.conversion_score * 0.20 +
    s.forecast_score * 0.16 +
    s.activity_score * 0.12 +
    s.responsiveness_score * 0.10 +
    s.client_satisfaction_score * 0.08 +
    s.reliability_score * 0.08,
  );
}

export function calculateCoachingScore(s: Omit<TeamScores, "coaching_score">, m: AgentMetrics): number {
  // Higher = MORE coaching needed. Driven by the weakest dimensions + overload
  // + opportunity loss. This is the "needs help" index.
  let need = 0;
  need += Math.max(0, 60 - s.conversion_score) * 0.5;
  need += Math.max(0, 55 - s.responsiveness_score) * 0.4;
  need += Math.max(0, 50 - s.revenue_score) * 0.3;
  if (s.workload_score < 35) need += 18; // overloaded
  if (s.workload_score > 88 && s.activity_score < 40) need += 14; // idle/underutilized
  if (m.lostDeals > m.wonDeals && m.lostDeals >= 2) need += 14;
  if (m.missedFollowups >= 2) need += 8;
  return clamp(need);
}

// ── Communication + Relationship scores (Agent Twin 2.0) ─────────────────────
export function calculateCommunicationScore(m: AgentMetrics): number {
  let s = m.avgCommHealth != null ? m.avgCommHealth : 60;
  if (m.missedFollowups > 0) s -= Math.min(25, m.missedFollowups * 6);
  if (m.openCommitments > 2) s -= 8;
  if (m.avgResponseMinutes != null && m.avgResponseMinutes <= 60) s += 6;
  return clamp(s);
}

/** Relationship capital — optional graph relationship strength (0..100) reinforces it. */
export function calculateRelationshipScore(m: AgentMetrics, graphStrength?: number | null): number {
  const base = graphStrength != null
    ? graphStrength * 0.5 + (m.avgCommHealth ?? 55) * 0.3 + Math.min(100, m.wonDeals * 10) * 0.2
    : (m.avgCommHealth ?? 55) * 0.5 + Math.min(100, m.wonDeals * 10) * 0.3 + Math.min(100, (m.activeBuyers + m.activeSellers) * 8) * 0.2;
  return clamp(base);
}

// ── Office health level + management priority ────────────────────────────────
export function officeHealthLevel(score: number): "elite" | "strong" | "healthy" | "warning" | "critical" {
  if (score >= 85) return "elite";
  if (score >= 70) return "strong";
  if (score >= 55) return "healthy";
  if (score >= 38) return "warning";
  return "critical";
}
export const OFFICE_LEVEL_LABEL: Record<string, string> = {
  elite: "מצוין", strong: "חזק", healthy: "תקין", warning: "אזהרה", critical: "קריטי",
};

/** Combined manager-priority for a ranked action. */
export function managementPriority(impact: number, urgency: number): number {
  return clamp(impact * 0.6 + urgency * 0.4);
}

export function computeTeamScores(m: AgentMetrics): TeamScores {
  const revenue_score = calculateRevenueScore(m);
  const conversion_score = calculateConversionScore(m);
  const activity_score = calculateActivityScore(m);
  const responsiveness_score = calculateResponsivenessScore(m);
  const workload_score = calculateWorkloadScore(m);
  const forecast_score = calculateForecastScore(m);
  const client_satisfaction_score = calculateClientSatisfactionScore(m);
  const reliability_score = calculateReliabilityScore(m);
  const partial = { revenue_score, conversion_score, activity_score, responsiveness_score, workload_score, forecast_score, client_satisfaction_score, reliability_score };
  const performance_score = calculatePerformanceScore(partial);
  const coaching_score = calculateCoachingScore({ ...partial, performance_score }, m);
  return { ...partial, performance_score, coaching_score };
}

// ── Tier + trend ─────────────────────────────────────────────────────────────
export type PerformanceTier = "elite" | "strong" | "stable" | "declining" | "critical";

export function classifyTier(performance: number, trend: GrowthTrend): PerformanceTier {
  if (performance >= 82) return "elite";
  if (performance >= 66) return "strong";
  if (performance >= 45) return trend === "declining" ? "declining" : "stable";
  if (performance >= 30) return "declining";
  return "critical";
}

export type GrowthTrend = "improving" | "flat" | "declining";

export function classifyTrend(recent90d: number, prev90d: number): GrowthTrend {
  if (recent90d === 0 && prev90d === 0) return "flat";
  if (prev90d === 0) return recent90d > 0 ? "improving" : "flat";
  const ratio = recent90d / prev90d;
  if (ratio >= 1.2) return "improving";
  if (ratio <= 0.8) return "declining";
  return "flat";
}

export const TIER_LABEL: Record<PerformanceTier, string> = {
  elite: "מצטיין", strong: "חזק", stable: "יציב", declining: "בירידה", critical: "קריטי",
};
export const TREND_LABEL: Record<GrowthTrend, string> = {
  improving: "במגמת שיפור", flat: "יציב", declining: "במגמת ירידה",
};

// ── Strengths / weaknesses / coaching ────────────────────────────────────────
export function deriveStrengthsWeaknesses(s: TeamScores): { strengths: string[]; weaknesses: string[] } {
  const dims: { key: string; label: string; v: number }[] = [
    { key: "revenue", label: "הכנסות", v: s.revenue_score },
    { key: "conversion", label: "המרה", v: s.conversion_score },
    { key: "forecast", label: "צנרת עתידית", v: s.forecast_score },
    { key: "activity", label: "פעילות", v: s.activity_score },
    { key: "responsiveness", label: "זמינות ותגובה", v: s.responsiveness_score },
    { key: "satisfaction", label: "שביעות רצון לקוחות", v: s.client_satisfaction_score },
    { key: "reliability", label: "אמינות", v: s.reliability_score },
  ];
  const strengths = dims.filter((d) => d.v >= 70).sort((a, b) => b.v - a.v).slice(0, 3).map((d) => d.label);
  const weaknesses = dims.filter((d) => d.v < 50).sort((a, b) => a.v - b.v).slice(0, 3).map((d) => d.label);
  return { strengths, weaknesses };
}

// ── Coaching signal detection ────────────────────────────────────────────────
export type CoachingSignalType =
  | "poor_followup" | "slow_response" | "declining_conversion" | "overloaded"
  | "underutilized" | "weak_locality_coverage" | "strong_specialization"
  | "high_opportunity_loss" | "forecast_gap";

export interface CoachingSignal {
  signal_type: CoachingSignalType;
  severity: "low" | "medium" | "high" | "critical";
  confidence_score: number;
  impact_score: number;
  title: string;
  description: string;
  recommendation: string;
}

export function detectCoachingSignals(m: AgentMetrics, s: TeamScores, trend: GrowthTrend, topSpecialty: { type: string; deals: number } | null): CoachingSignal[] {
  const out: CoachingSignal[] = [];
  const name = m.name;

  if (m.missedFollowups >= 2) {
    out.push({ signal_type: "poor_followup", severity: m.missedFollowups >= 5 ? "high" : "medium", confidence_score: 85, impact_score: clamp(40 + m.missedFollowups * 6),
      title: `${name} · מעקבים שלא בוצעו`, description: `${m.missedFollowups} פולואפים פתוחים באיחור.`, recommendation: "בנה שגרת מעקב יומית והשלם פולואפים פתוחים." });
  }
  if (m.avgResponseMinutes != null && m.avgResponseMinutes > 240) {
    out.push({ signal_type: "slow_response", severity: m.avgResponseMinutes > 720 ? "high" : "medium", confidence_score: 80, impact_score: 60,
      title: `${name} · זמן תגובה איטי`, description: `זמן תגובה ממוצע ${Math.round(m.avgResponseMinutes / 60)} שעות.`, recommendation: "הגדר יעד מענה תוך שעה ללידים חמים." });
  }
  if (s.conversion_score < 45 && (m.wonDeals + m.lostDeals) >= 3) {
    out.push({ signal_type: "declining_conversion", severity: trend === "declining" ? "high" : "medium", confidence_score: 78, impact_score: 70,
      title: `${name} · המרה נמוכה`, description: `יחס סגירה נמוך (${m.wonDeals}/${m.wonDeals + m.lostDeals}).`, recommendation: "אימון מכירות: טיפול בהתנגדויות וסגירה." });
  }
  if (s.workload_score < 35) {
    out.push({ signal_type: "overloaded", severity: s.workload_score < 22 ? "critical" : "high", confidence_score: 82, impact_score: 75,
      title: `${name} עמוס מדי`, description: "עומס פעיל גבוה משמעותית מהממוצע במשרד.", recommendation: "נתב לידים חדשים לסוכן פנוי ואזן את התיק." });
  }
  if (s.workload_score > 88 && s.activity_score < 40) {
    out.push({ signal_type: "underutilized", severity: "medium", confidence_score: 75, impact_score: 55,
      title: `${name} · ניצול חסר`, description: "קיבולת פנויה גבוהה עם פעילות נמוכה.", recommendation: "הקצה לו יותר לידים — יש קיבולת פנויה." });
  }
  if (m.localityCount <= 1 && m.wonDeals >= 2) {
    out.push({ signal_type: "weak_locality_coverage", severity: "low", confidence_score: 65, impact_score: 45,
      title: `${name} · כיסוי אזורי צר`, description: `פעיל בעיקר באזור אחד (${m.localityCount}).`, recommendation: "הרחב פעילות לאזור סמוך נוסף." });
  }
  if (topSpecialty && topSpecialty.deals >= 3) {
    out.push({ signal_type: "strong_specialization", severity: "low", confidence_score: 80, impact_score: 50,
      title: `${name} · מומחיות חזקה`, description: `חזק במיוחד ב${topSpecialty.type} (${topSpecialty.deals} עסקאות).`, recommendation: `הזרם לידים מסוג ${topSpecialty.type} לסוכן זה.` });
  }
  if (m.lostDeals >= 2 && m.lostDeals >= m.wonDeals) {
    out.push({ signal_type: "high_opportunity_loss", severity: m.lostDeals >= 4 ? "high" : "medium", confidence_score: 76, impact_score: 72,
      title: `${name} · אובדן הזדמנויות`, description: `${m.lostDeals} עסקאות אבודות לעומת ${m.wonDeals} שנסגרו.`, recommendation: "נתח עסקאות אבודות וזהה דפוס חוזר." });
  }
  if (s.forecast_score < 35 && m.activeMatches + m.activeBuyers >= 3) {
    out.push({ signal_type: "forecast_gap", severity: "medium", confidence_score: 70, impact_score: 60,
      title: `${name} · פער בצנרת`, description: "תיק פעיל גדול אך צנרת עתידית חלשה.", recommendation: "קדם התאמות פעילות לשלבים מתקדמים." });
  }
  return out;
}

// ── Office Health Engine ─────────────────────────────────────────────────────
export interface OfficeHealthInput {
  forecastRevenue: number;
  totalRevenue: number;
  avgConversion: number;       // 0..100
  avgWorkloadScore: number;    // 0..100 (higher = more balanced capacity)
  workloadStdev: number;       // dispersion of load across agents
  avgCommHealth: number;       // 0..100
  opportunityLeakage: number;  // # of overloaded-driven leaks / at-risk deals
  localityCoverage: number;    // 0..100 (well-covered localities ratio)
  decliningRatio: number;      // 0..1 share of agents declining
  avgPerformance: number;      // 0..100
}

export interface OfficeHealth { office_health_score: number; growth_score: number; risk_score: number }

export function calculateOfficeHealth(i: OfficeHealthInput): OfficeHealth {
  const pipelineQuality = i.forecastRevenue > 0 ? Math.min(100, 50 + (i.forecastRevenue > i.totalRevenue ? 30 : 15)) : 35;
  const balance = clamp(i.avgWorkloadScore - Math.min(40, i.workloadStdev));
  const health = clamp(
    i.avgPerformance * 0.30 +
    i.avgConversion * 0.16 +
    pipelineQuality * 0.14 +
    balance * 0.12 +
    i.avgCommHealth * 0.12 +
    i.localityCoverage * 0.08 +
    Math.max(0, 100 - i.opportunityLeakage * 10) * 0.08,
  );
  const growth = clamp(
    pipelineQuality * 0.35 +
    i.avgPerformance * 0.25 +
    (100 - i.decliningRatio * 100) * 0.25 +
    i.localityCoverage * 0.15,
  );
  const risk = clamp(
    i.opportunityLeakage * 9 +
    i.decliningRatio * 45 +
    Math.max(0, 60 - balance) * 0.5 +
    Math.max(0, 55 - i.avgCommHealth) * 0.4,
  );
  return { office_health_score: health, growth_score: growth, risk_score: risk };
}

// ── Territory Coverage Engine ────────────────────────────────────────────────
export interface LocalityCoverage {
  locality: string;
  topAgent: string | null;
  topAgentDeals: number;
  agentCount: number;
  demand: number;          // 0..100 from market snapshot (optional, default 0)
  status: "strong" | "single_point" | "uncovered" | "vulnerable";
  recommendation: string;
}

export function assessTerritoryCoverage(
  localities: { locality: string; agents: { name: string; deals: number }[]; demand: number }[],
): LocalityCoverage[] {
  return localities.map((l) => {
    const sorted = [...l.agents].sort((a, b) => b.deals - a.deals);
    const top = sorted[0] ?? null;
    const agentCount = sorted.filter((a) => a.deals > 0).length;
    let status: LocalityCoverage["status"];
    let recommendation: string;
    if (!top || top.deals === 0) { status = "uncovered"; recommendation = l.demand >= 60 ? "אזור עם ביקוש ללא מומחה — הקצה סוכן מוביל." : "אין כיסוי — שקול גיוס פעיל באזור."; }
    else if (agentCount === 1) { status = l.demand >= 60 ? "vulnerable" : "single_point"; recommendation = "תלות בסוכן יחיד — בנה גיבוי באזור."; }
    else if (top.deals >= 3) { status = "strong"; recommendation = "כיסוי חזק — שמר על המומחיות."; }
    else { status = "single_point"; recommendation = "כיסוי חלקי — חזק את הנוכחות באזור."; }
    return { locality: l.locality, topAgent: top?.name ?? null, topAgentDeals: top?.deals ?? 0, agentCount, demand: l.demand, status, recommendation };
  }).sort((a, b) => b.demand - a.demand || b.topAgentDeals - a.topAgentDeals);
}

// ── AI-ready text (deterministic) ────────────────────────────────────────────
export function buildTeamAi(name: string, s: TeamScores, tier: PerformanceTier, trend: GrowthTrend, sw: { strengths: string[]; weaknesses: string[] }, m: AgentMetrics): { ai_summary: string; ai_growth_plan: string; ai_coaching_plan: string } {
  const strengthsTxt = sw.strengths.length ? sw.strengths.join(", ") : "—";
  const weakTxt = sw.weaknesses.length ? sw.weaknesses.join(", ") : "—";
  return {
    ai_summary: `${name}: ביצועים ${s.performance_score} (${TIER_LABEL[tier]}, ${TREND_LABEL[trend]}). ${m.wonDeals} עסקאות, המרה ${s.conversion_score}. חזק ב: ${strengthsTxt}.`,
    ai_growth_plan: sw.weaknesses.length ? `מוקדי צמיחה: ${weakTxt}. התמקדות בשיפורם תעלה את הביצועים הכוללים.` : `ביצועים גבוהים — שמר על המומנטום והרחב כיסוי אזורי.`,
    ai_coaching_plan: s.coaching_score >= 50 ? `נדרש ליווי (${s.coaching_score}): ${weakTxt || "איזון עומסים"}.` : `ליווי שגרתי — סוכן יציב.`,
  };
}
