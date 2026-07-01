// ============================================================================
// 🧠 Chief of Staff — Organization Score + Executive Dashboard (pure). 27.6.
// Deterministic, evidence-based scoring over normalized OrgSignals. No engine
// is modified; every dimension records the basis (evidence) it was computed on.
// When data is missing the score stays conservative and confidence drops — no
// speculative inflation.
// ============================================================================
import type {
  OrgSignals, OrganizationScore, ScoreDim, ExecutiveDashboard, HealthScore,
} from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const pct = (n: number, d: number): number => (d > 0 ? (n / d) * 100 : 0);

/** Pressure from blocked/waiting missions relative to the open workload (0..100). */
function blockedWaitingPressure(m: OrgSignals["missions"]): number {
  const open = m.active + m.blocked + m.waiting;
  if (open <= 0) return 0;
  return clamp(pct(m.blocked * 1.5 + m.waiting, open));
}

/** Part 9 — the Organization Score across 8 dimensions + weighted overall. */
export function computeOrganizationScore(sig: OrgSignals): OrganizationScore {
  const m = sig.missions;
  const mk = sig.market;
  const hasMarket = mk.citiesAnalyzed > 0;
  const hasMissions = m.active + m.completed + m.cancelled > 0;

  const cancelledRate = pct(m.cancelled, m.completed + m.cancelled);
  const pressure = blockedWaitingPressure(m);

  // Growth — market momentum blended with mission completion; declining cities penalize.
  const growth = clamp(
    (hasMarket ? mk.avgBusinessScore * 0.6 : 45) +
    m.completionRatePct * 0.4 -
    mk.decliningCities * 5,
  );
  // Execution — Action Center execution score, discounted by blocked/waiting pressure.
  const execution = clamp(m.executionScore * 0.7 + (100 - pressure) * 0.3);
  // Coverage — presence of offices / brokers / listings / cities (normalized, capped).
  const coverage = clamp(
    clamp(sig.offices * 4) * 0.3 +
    clamp(sig.brokers * 2) * 0.3 +
    clamp(sig.activeListings * 0.5) * 0.2 +
    clamp(sig.activeCities * 12) * 0.2,
  );
  // Competitive position — market business score (blends concentration + coverage)
  // with a fallback to coverage when no city was analyzed.
  const competitivePosition = clamp(hasMarket ? mk.avgBusinessScore : coverage * 0.6);
  // Data quality — straight from the graph-completeness composite.
  const dataQuality = clamp(sig.dataQualityScore);
  // Operational health — low blocked/waiting pressure + broker→office resolution.
  const operationalHealth = clamp((100 - pressure) * 0.6 + sig.resolutionRatePct * 0.4);
  // Mission success — completion rate, penalized by cancellations.
  const missionSuccess = clamp(hasMissions ? m.completionRatePct - cancelledRate * 0.5 : 40);
  // Learning progress — organizational memory depth (completed+cancelled) + data quality.
  const learningProgress = clamp(clamp((m.completed + m.cancelled) * 8) * 0.6 + sig.dataQualityScore * 0.4);

  const dims: ScoreDim[] = [
    { key: "growth", label: "צמיחה", score: growth, basis: hasMarket ? `ציון עסקי ממוצע ${clamp(mk.avgBusinessScore)}, ${mk.decliningCities} ערים בירידה` : "אין ניתוח שוק — מבוסס על ביצוע משימות בלבד" },
    { key: "execution", label: "ביצוע", score: execution, basis: `ציון ביצוע ${m.executionScore}, לחץ חסימות/המתנה ${pressure}` },
    { key: "coverage", label: "כיסוי", score: coverage, basis: `${sig.offices} משרדים · ${sig.brokers} מתווכים · ${sig.activeListings} מודעות · ${sig.activeCities} ערים` },
    { key: "competitivePosition", label: "מיצוב תחרותי", score: competitivePosition, basis: hasMarket ? `ציון שוק ממוצע ${clamp(mk.avgBusinessScore)} על פני ${mk.citiesAnalyzed} ערים` : "נגזר מכיסוי — אין דשבורד תחרותי" },
    { key: "dataQuality", label: "איכות נתונים", score: dataQuality, basis: `כיסוי קישורים ${clamp(sig.linkCoveragePct)}%, פתרון מתווכים ${clamp(sig.resolutionRatePct)}%` },
    { key: "operationalHealth", label: "בריאות תפעולית", score: operationalHealth, basis: `${m.blocked} חסומות · ${m.waiting} בהמתנה · פתרון ${clamp(sig.resolutionRatePct)}%` },
    { key: "missionSuccess", label: "הצלחת משימות", score: missionSuccess, basis: `${m.completed} הושלמו · ${m.cancelled} בוטלו · שיעור השלמה ${m.completionRatePct}%` },
    { key: "learningProgress", label: "למידה ארגונית", score: learningProgress, basis: `${m.completed + m.cancelled} משימות בזיכרון · איכות נתונים ${clamp(sig.dataQualityScore)}` },
  ];

  const W: Record<string, number> = {
    growth: 0.16, execution: 0.18, coverage: 0.12, competitivePosition: 0.12,
    dataQuality: 0.1, operationalHealth: 0.12, missionSuccess: 0.12, learningProgress: 0.08,
  };
  const overall = clamp(dims.reduce((s, d) => s + d.score * (W[d.key] ?? 0), 0));

  // Confidence — how much real data backs the number (never overstated).
  const confidence = clamp(
    clamp(sig.dataQualityScore) * 0.4 +
    (hasMarket ? mk.avgConfidence : 0) * 0.3 +
    clamp(sig.sourcesUsed * 20) * 0.3,
  );

  return {
    growth, execution, coverage, competitivePosition, dataQuality,
    operationalHealth, missionSuccess, learningProgress, overall, dims, confidence,
  };
}

/** Part 8 — the CEO Executive Dashboard (six health lenses + AI confidence). */
export function computeDashboard(sig: OrgSignals, score: OrganizationScore): ExecutiveDashboard {
  const mk = sig.market;
  const hasMarket = mk.citiesAnalyzed > 0;

  const businessHealth = score.overall;
  const executionHealth = score.execution;
  const marketHealth = clamp(hasMarket ? mk.avgBusinessScore : score.coverage * 0.6);
  const salesHealth = clamp(clamp(sig.activeListings * 0.6) * 0.5 + (hasMarket ? mk.avgBusinessScore : score.coverage) * 0.5);
  const growthHealth = score.growth;
  const riskHealth = clamp(100 - mk.riskCount * 8 - sig.missions.blocked * 5 - mk.decliningCities * 6);

  const health: HealthScore[] = [
    { key: "business", label: "בריאות עסקית", score: businessHealth, basis: `ציון ארגוני כולל ${score.overall}` },
    { key: "execution", label: "בריאות ביצוע", score: executionHealth, basis: `ביצוע ${sig.missions.executionScore}, ${sig.missions.blocked} חסומות` },
    { key: "market", label: "בריאות שוק", score: marketHealth, basis: hasMarket ? `ממוצע ${mk.citiesAnalyzed} ערים` : "אין ניתוח שוק — נגזר מכיסוי" },
    { key: "sales", label: "בריאות מכירות", score: salesHealth, basis: `${sig.activeListings} מודעות פעילות` },
    { key: "growth", label: "בריאות צמיחה", score: growthHealth, basis: `${mk.decliningCities} ערים בירידה · השלמה ${sig.missions.completionRatePct}%` },
    { key: "risk", label: "בריאות סיכון", score: riskHealth, basis: `${mk.riskCount} סיכונים · ${sig.missions.blocked} חסומות` },
  ];

  return { health, aiConfidence: score.confidence, overallScore: score.overall };
}
