// ============================================================================
// 🏠 Listing Agent — Market Performance engine (pure). 29.3.2.
// Whether a listing is ACTUALLY performing vs the market — valuation is only one
// of many signals: time-on-market vs market median, buyer demand/matches,
// competition, price position, recent activity, mission history, momentum,
// valuation position, truth and freshness. Evidence-only; no engine modified.
// ============================================================================
import { clamp } from "./health";
import type { ListingSignals, PropertyHealth, MarketPerformance, DomBand, PerformanceInsight, MarketPosition, PerformanceTrend } from "./types";

const DOM_SCORE: Record<DomBand, number> = { fast: 92, normal: 70, slow: 40, very_slow: 15, unknown: 50 };

function domBand(days: number | null, median: number | null): { band: DomBand; ratio: number | null } {
  if (days == null || median == null || median <= 0) return { band: "unknown", ratio: null };
  const ratio = Math.round((days / median) * 100) / 100;
  const band: DomBand = ratio <= 0.6 ? "fast" : ratio <= 1.2 ? "normal" : ratio <= 2 ? "slow" : "very_slow";
  return { band, ratio };
}

export function computeMarketPerformance(sig: ListingSignals, h: PropertyHealth): MarketPerformance {
  const { band, ratio } = domBand(sig.timeOnMarketDays, sig.medianDomCity);
  const v = sig.valuation;

  const buyerDemand = { activeMatches: sig.matchCount, perfectMatches: sig.perfectMatchCount, avgMatchScore: sig.avgMatchScore, recentActivity: sig.recentBuyerActivity, demandScore: h.demand };
  const competition = { inventoryTrendPct: sig.market?.inventoryTrendPct ?? null, concentrationLevel: sig.market?.concentrationLevel ?? null, topSharePct: sig.market?.topSharePct ?? null, pressure: h.competitionPressure };
  const pricePosition = { rangePosition: v.rangePosition, gapPct: v.priceGapPct };

  // Price score — valuation range when known, else pricing-health proxy.
  const priceScore = v.available && v.rangePosition !== "unknown"
    ? (v.rangePosition === "within" ? 85 : v.rangePosition === "below" ? 72 : clamp(60 - Math.min(40, Math.abs(v.priceGapPct ?? 0))))
    : h.pricingHealth;
  const valuationScore = v.available ? (v.rangePosition === "within" ? 80 : v.rangePosition === "below" ? 65 : 45) : 50;

  const score = clamp(
    DOM_SCORE[band] * 0.18 + h.demand * 0.18 + (100 - h.competitionPressure) * 0.12 + priceScore * 0.14 +
    h.freshness * 0.1 + h.momentum * 0.1 + valuationScore * 0.08 + (sig.truthScore ?? 50) * 0.1,
  );

  const marketPosition: MarketPosition =
    band === "unknown" && h.demand === 0 ? "unknown"
    : score >= 68 && (band === "fast" || band === "normal") ? "above"
    : score <= 40 || band === "very_slow" ? "below" : "at";

  const trend: PerformanceTrend =
    sig.recentBuyerActivity >= 3 && (competition.inventoryTrendPct == null || competition.inventoryTrendPct >= 0) ? "improving"
    : h.freshness <= 20 && h.demand < 40 ? "declining" : "stable";

  // Part 5 — explainable performance insights.
  const insights: PerformanceInsight[] = [];
  if (score >= 70 && (band === "fast" || band === "normal")) insights.push({ text: "הנכס מבצע מעל השוק", evidence: [`ציון ביצוע ${score}`, `זמן בשוק ${sig.timeOnMarketDays} מול חציון ${sig.medianDomCity ?? "—"}`] });
  if (band === "slow" || band === "very_slow") insights.push({ text: "המודעה איטית ביחס לשוק", evidence: [`יחס ${ratio}× לחציון`] });
  if (h.demand >= 65) insights.push({ text: "ביקוש קונים חזק", evidence: [`${sig.matchCount} התאמות · ${sig.perfectMatchCount} מושלמות`] });
  if (h.demand < 40) insights.push({ text: "ביקוש קונים חלש", evidence: [`ביקוש ${h.demand}`] });
  if ((competition.inventoryTrendPct ?? 0) > 5 || h.competitionPressure >= 60) insights.push({ text: "התחרות גוברת", evidence: [competition.inventoryTrendPct != null ? `מגמת מלאי ${competition.inventoryTrendPct}%` : `לחץ תחרות ${h.competitionPressure}`, competition.concentrationLevel ? `ריכוזיות ${competition.concentrationLevel}` : ""].filter(Boolean) });
  if (v.available && v.rangePosition === "above") insights.push({ text: "המחיר נעשה פחות תחרותי מול ההערכה", evidence: [`+${v.priceGapPct}% מעל טווח`] });
  if (h.freshness <= 10 && sig.recentBuyerActivity === 0) insights.push({ text: "אין פעילות אחרונה", evidence: [`טריות ${h.freshness}`] });

  return { score, domVsMarket: { days: sig.timeOnMarketDays, median: sig.medianDomCity, ratio, band }, buyerDemand, competition, pricePosition, marketPosition, momentum: h.momentum, trend, insights };
}
