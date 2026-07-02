// ============================================================================
// 🛒 Buyer Agent — Buyer Health engine (pure). 29.4. Part 1.
// Composes the Buyer Digital Twin's signals into the 10 required health metrics.
// No recomputation of the twin profile (no duplicated logic).
// ============================================================================
import type { BuyerSignals, BuyerHealth } from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

export function computeBuyerHealth(sig: BuyerSignals): BuyerHealth {
  const b = sig.behavior;
  const buyingReadiness = clamp(sig.readiness);
  const buyingConfidence = clamp(sig.probabilityToBuy);
  const buyingMomentum = clamp(sig.engagementScore * 0.5 + sig.recencyScore * 0.3 + Math.min(100, (b.visits + b.offers) * 20) * 0.2);
  const activity = clamp(sig.recencyScore);
  const relationshipHealth = clamp(45 + sig.relationshipDegree * 8 + sig.trust * 0.2);
  const decisionConfidence = clamp(sig.completeness * 0.6 + (/החלטי/.test(sig.decisionStyle) ? 30 : /אנליטי/.test(sig.decisionStyle) ? 15 : 5) + Math.min(20, b.visits * 6));
  const buyerHealth = clamp(sig.healthScore * 0.4 + buyingReadiness * 0.2 + buyingMomentum * 0.2 + relationshipHealth * 0.1 + sig.communicationHealth * 0.1);

  const label: BuyerHealth["label"] =
    sig.totalActivities === 0 ? "חדש"
    : sig.recencyScore <= 10 ? "רדום"
    : buyingConfidence < 30 || sig.classification.includes("קונה קר") ? "בסיכון"
    : buyerHealth >= 66 ? "בריא" : "יציב";

  return {
    buyerHealth, buyingReadiness, buyingMomentum, buyingConfidence,
    trust: clamp(sig.trust), urgency: clamp(sig.urgency), activity,
    relationshipHealth, communicationHealth: clamp(sig.communicationHealth), decisionConfidence, label,
    basis: [
      `מוכנות ${buyingReadiness} · מומנטום ${buyingMomentum} · הסתברות ${buyingConfidence}`,
      `אמון ${clamp(sig.trust)} · דחיפות ${clamp(sig.urgency)} · תקשורת ${clamp(sig.communicationHealth)}`,
      `${sig.totalActivities} פעילויות · ${b.visits} ביקורים · ${b.offers} הצעות`,
    ],
  };
}
