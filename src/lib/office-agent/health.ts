// ============================================================================
// 🏢 Office Growth Agent — Office Health engine (pure). 29.7. Part 1.
// Composes the reused-engine signals into the 10 required business-health
// metrics. No recomputation of the underlying engines (no duplicated logic).
// ============================================================================
import type { OfficeSignals, OfficeHealth } from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);

export function computeOfficeHealth(sig: OfficeSignals): OfficeHealth {
  const businessHealth = clamp(sig.businessScore * 0.7 + sig.avgBusinessScore * 0.3);

  // Growth = market trend + net competitor momentum (growing us vs. growing them).
  const trend = clamp(50 + sig.competitive.inventoryTrendPct);
  const decliningPenalty = sig.citiesAnalyzed > 0 ? (sig.decliningCities / sig.citiesAnalyzed) * 40 : 0;
  const growthHealth = clamp(trend - decliningPenalty + (sig.competitive.growingCompetitors.length > sig.competitive.decliningCompetitors.length ? -10 : 8));

  // Inventory = adequacy vs. brokers/cities, minus stale share.
  const staleShare = ratio(sig.listingPipeline.stale, Math.max(1, sig.listingPipeline.total));
  const perBroker = ratio(sig.activeListings, Math.max(1, sig.brokers));
  const inventoryHealth = clamp(40 + Math.min(40, perBroker * 6) + (sig.activeCities > 0 ? 10 : 0) - staleShare * 40);

  const buyerPipelineHealth = clamp(sig.buyerPipeline.total === 0 ? 30 : 45 + ratio(sig.buyerPipeline.hot + sig.buyerPipeline.closing + sig.buyerPipeline.withMatches, sig.buyerPipeline.total) * 45 - ratio(sig.buyerPipeline.cold, sig.buyerPipeline.total) * 20);
  const sellerPipelineHealth = clamp(sig.sellerPipeline.total === 0 ? 30 : 45 + ratio(sig.sellerPipeline.readyToSign + sig.sellerPipeline.hot + sig.sellerPipeline.withBuyers, sig.sellerPipeline.total) * 45 - ratio(sig.sellerPipeline.atRisk + sig.sellerPipeline.priceIssues, sig.sellerPipeline.total) * 25);
  const leadPipelineHealth = clamp(sig.leadPipeline.total === 0 ? 30 : 45 + ratio(sig.leadPipeline.hot + sig.leadPipeline.convertReady, sig.leadPipeline.total) * 45 - ratio(sig.leadPipeline.duplicates + sig.leadPipeline.humanReview, sig.leadPipeline.total) * 20);

  const brokerProductivity = clamp(sig.brokers === 0 ? 0 : 35 + Math.min(45, perBroker * 7) + (sig.executionScore * 0.2));

  // Market position = share + inverse concentration pressure + business score.
  const marketPosition = clamp(sig.competitive.topOfficeSharePct * 0.5 + businessHealth * 0.3 + (sig.strongAreas.length > sig.weakAreas.length ? 15 : 5));

  // Expansion readiness = spare capacity + confidence + inventory adequacy.
  const spareCapacity = perBroker < 4 ? 60 : perBroker < 8 ? 45 : 25;
  const expansionReadiness = clamp(spareCapacity * 0.4 + businessHealth * 0.3 + sig.aiConfidence * 0.3);

  const businessConfidence = clamp(sig.dataQualityScore * 0.5 + sig.aiConfidence * 0.3 + (sig.citiesAnalyzed > 0 ? 20 : 0));

  const composite = clamp(businessHealth * 0.3 + growthHealth * 0.2 + inventoryHealth * 0.15 + (buyerPipelineHealth + sellerPipelineHealth + leadPipelineHealth) / 3 * 0.2 + marketPosition * 0.15);
  const label: OfficeHealth["label"] =
    sig.offices === 0 && sig.brokers === 0 ? "חדשה"
    : composite >= 78 ? "מצוינת"
    : composite >= 62 ? "בריאה"
    : composite >= 45 ? "יציבה" : "בסיכון";

  return {
    businessHealth, growthHealth, inventoryHealth,
    buyerPipelineHealth, sellerPipelineHealth, leadPipelineHealth,
    brokerProductivity, marketPosition, expansionReadiness, businessConfidence, label,
    basis: [
      `עסקי ${businessHealth} · צמיחה ${growthHealth} · מלאי ${inventoryHealth}`,
      `קונים ${buyerPipelineHealth} · מוכרים ${sellerPipelineHealth} · לידים ${leadPipelineHealth}`,
      `${sig.offices} משרדים · ${sig.brokers} מתווכים · ${sig.activeListings} נכסים · ${sig.activeCities} ערים`,
    ],
  };
}
