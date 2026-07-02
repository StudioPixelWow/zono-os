// ============================================================================
// 🏷️ Seller Agent — Seller Health engine (pure). 29.5. Part 1.
// Composes the Seller Digital Twin's signals into the 11 required metrics.
// No recomputation of the twin profile (no duplicated logic).
// ============================================================================
import type { SellerSignals, SellerHealth } from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

export function computeSellerHealth(sig: SellerSignals): SellerHealth {
  const listed = sig.property.hasProperty && (sig.property.status === "active" || sig.property.status === "published");
  const readinessToSell = clamp(sig.motivation * 0.5 + sig.readinessToSign * 0.3 + (listed ? 15 : 0) + sig.engagementScore * 0.05);
  const priceFlexibility = clamp(sig.priceFlexibility ?? 50);
  const relationshipHealth = clamp(45 + sig.relationshipDegree * 8 + sig.trust * 0.2);
  const decisionConfidence = clamp(sig.completeness * 0.6 + (/החלטי/.test(sig.decisionStyle) ? 30 : /אנליטי/.test(sig.decisionStyle) ? 15 : 5) + Math.min(20, sig.behavior.meetings * 6));
  const sellerHealth = clamp(sig.healthScore * 0.4 + sig.motivation * 0.2 + sig.readinessToSign * 0.15 + relationshipHealth * 0.1 + sig.communicationHealth * 0.1 + (100 - sig.churnRisk) * 0.05);

  const label: SellerHealth["label"] =
    sig.totalActivities === 0 ? "חדש"
    : sig.recencyScore <= 10 ? "רדום"
    : sig.churnRisk >= 60 || sig.classification.includes("בסיכון נטישה") ? "בסיכון"
    : sellerHealth >= 66 ? "בריא" : "יציב";

  return {
    sellerHealth, trust: clamp(sig.trust), motivation: clamp(sig.motivation), readinessToSign: clamp(sig.readinessToSign), readinessToSell,
    communicationHealth: clamp(sig.communicationHealth), relationshipHealth, priceFlexibility, priceExpectation: sig.priceExpectation,
    churnRisk: clamp(sig.churnRisk), decisionConfidence, label,
    basis: [
      `מוטיבציה ${clamp(sig.motivation)} · מוכנות לחתימה ${clamp(sig.readinessToSign)} · לחתום ${readinessToSell}`,
      `אמון ${clamp(sig.trust)} · נטישה ${clamp(sig.churnRisk)} · גמישות מחיר ${priceFlexibility}`,
      `${sig.totalActivities} פעילויות · ${sig.behavior.meetings} פגישות · ${sig.behavior.valuationsSent} הערכות`,
    ],
  };
}
