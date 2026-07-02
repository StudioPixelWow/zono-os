// ============================================================================
// 🏠 Listing Agent — Property Health engine (pure). 29.3. Part 2.
// ============================================================================
import type { ListingSignals, PropertyHealth } from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const DAY = 86400000;
const recencyOf = (iso: string | null, now: number): number => {
  if (!iso) return 0; const d = (now - new Date(iso).getTime()) / DAY;
  return d < 0 ? 0 : d <= 3 ? 100 : d <= 14 ? 75 : d <= 30 ? 45 : d <= 90 ? 20 : 5;
};

export function computePropertyHealth(sig: ListingSignals, now: number = Date.now()): PropertyHealth {
  const tom = sig.timeOnMarketDays ?? 0;
  const freshness = Math.max(recencyOf(sig.lastActivityAt, now), recencyOf(sig.updatedAt, now));

  const demand = clamp(Math.min(100, sig.matchCount * 12) * 0.5 + sig.avgMatchScore * 0.3 + Math.min(100, sig.recentBuyerActivity * 20) * 0.2);
  const momentum = clamp(sig.matchCount > 0 ? (sig.recentBuyerActivity / Math.max(1, sig.matchCount)) * 100 * 0.6 + freshness * 0.4 : freshness * 0.5);

  // Competition pressure — declining/concentrated market raises it.
  const mkt = sig.market;
  // Competition pressure rises with inventory GROWTH (more supply = more rivals),
  // broker concentration and a dominant top share.
  const competitionPressure = clamp(mkt ? ((mkt.inventoryTrendPct != null && mkt.inventoryTrendPct > 0 ? Math.min(30, mkt.inventoryTrendPct) : 0) + (mkt.concentrationLevel === "concentrated" ? 40 : mkt.concentrationLevel === "moderate" ? 20 : 0) + (mkt.topSharePct != null ? Math.min(20, mkt.topSharePct / 5) : 0)) : 20);

  // Pricing health — VALUATION-BACKED when real evidence exists (29.3.1), else
  // falls back to market response. Weak/stale valuations carry less weight.
  const v = sig.valuation;
  let pricingHealth: number;
  if (v.available && v.rangePosition !== "unknown") {
    const confW = v.confidenceLabel === "high" ? 1 : v.confidenceLabel === "medium" ? 0.7 : 0.4;
    const freshW = v.fresh ? 1 : 0.6;
    const gapPen = v.rangePosition === "above" ? Math.min(45, Math.abs(v.priceGapPct ?? 0)) * confW * freshW : 0;
    const belowPen = v.rangePosition === "below" ? Math.min(15, Math.abs(v.priceGapPct ?? 0) * 0.3) : 0;
    const withinBonus = v.rangePosition === "within" ? 15 : 0;
    pricingHealth = clamp(70 + withinBonus + demand * 0.15 - gapPen - belowPen - (v.fresh ? 0 : 5));
  } else {
    const overpricedSignal = tom > 60 && demand < 40 ? Math.min(50, (tom - 60) / 2 + (40 - demand)) : 0;
    pricingHealth = clamp(65 + demand * 0.2 - overpricedSignal - (sig.estimatedDaysToSell != null && sig.estimatedDaysToSell > 120 ? 15 : 0));
  }

  const exposure = clamp(Math.min(100, sig.matchCount * 10) + (sig.campaignActive ? 25 : 0));
  const marketingHealth = clamp(exposure * 0.5 + freshness * 0.3 + (sig.campaignActive === false ? -15 : 0) + 40);

  const listingHealth = clamp(pricingHealth * 0.3 + marketingHealth * 0.25 + demand * 0.25 + freshness * 0.2 - competitionPressure * 0.1);

  const exclUrg = sig.exclusivityEndsAt ? Math.max(0, 30 - (new Date(sig.exclusivityEndsAt).getTime() - now) / DAY) : 0;
  const urgency = clamp((tom > 90 ? 40 : tom > 45 ? 25 : 10) + (100 - demand) * 0.2 + exclUrg + competitionPressure * 0.2);

  const present = [sig.price != null, sig.zonoScore != null, sig.matchCount > 0, !!sig.market, !!sig.listedAt, sig.valuationEstimate != null, sig.truthScore != null];
  const confidence = clamp((present.filter(Boolean).length / present.length) * 100 * 0.7 + (sig.truthScore ?? 0) * 0.3);

  const isNew = tom <= 7 && sig.matchCount === 0;
  const label: PropertyHealth["label"] =
    isNew ? "חדש"
    : listingHealth >= 66 && competitionPressure < 60 ? "בריא"
    : listingHealth < 35 || (tom > 90 && demand < 30) ? "קריטי"
    : listingHealth < 50 ? "בסיכון" : "יציב";

  return {
    listingHealth, marketingHealth, pricingHealth, demand, urgency, momentum, freshness, competitionPressure, confidence, label,
    basis: [
      `TOM ${tom} ימים · ביקוש ${demand} · טריות ${freshness}`,
      `תמחור ${pricingHealth} · שיווק ${marketingHealth} · לחץ תחרות ${competitionPressure}`,
      `${sig.matchCount} התאמות · ${sig.recentBuyerActivity} פעילויות אחרונות`,
    ],
  };
}
