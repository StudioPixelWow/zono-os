// ============================================================================
// 🎯 Lead Agent — Lead Health engine (pure). 29.6. Part 1.
// Composes the Lead Digital Twin's signals into the 11 required metrics.
// No recomputation of the twin profile (no duplicated logic).
// ============================================================================
import type { LeadSignals, LeadHealth } from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

export function computeLeadHealth(sig: LeadSignals): LeadHealth {
  const contactability = clamp(100 - sig.contactRisk);
  const relationshipStrength = clamp(40 + sig.relationshipDegree * 10 + (sig.existingCustomer ? 20 : 0));
  const decisionConfidence = clamp(sig.completeness * 0.6 + (["qualified", "nurturing", "converted"].includes(sig.stage) ? 25 : sig.stage === "contacted" ? 10 : 0));
  const leadHealth = clamp(sig.healthScore * 0.35 + sig.leadQuality * 0.2 + sig.conversionProbability * 0.2 + contactability * 0.1 + relationshipStrength * 0.1 + (100 - sig.duplicateRisk) * 0.05);

  const label: LeadHealth["label"] =
    sig.totalActivities === 0 && !sig.lastActivityAt ? "חדש"
    : sig.recencyScore <= 10 ? "רדום"
    : sig.conversionProbability < 30 || sig.classification.includes("ליד קר") ? "בסיכון"
    : leadHealth >= 66 ? "בריא" : "יציב";

  return {
    leadHealth, leadQuality: clamp(sig.leadQuality), intentConfidence: clamp(sig.intentConfidence), conversionProbability: clamp(sig.conversionProbability),
    urgency: clamp(sig.urgency), contactability, duplicateRisk: clamp(sig.duplicateRisk), communicationHealth: clamp(sig.communicationHealth),
    relationshipStrength, dataCompleteness: clamp(sig.completeness), decisionConfidence, label,
    basis: [
      `איכות ${clamp(sig.leadQuality)} · המרה ${clamp(sig.conversionProbability)} · כוונה ${clamp(sig.intentConfidence)}`,
      `נגישות ${contactability} · כפילות ${clamp(sig.duplicateRisk)} · שלמות ${clamp(sig.completeness)}`,
      `${sig.totalActivities} פעילויות · שלב ${sig.stage} · מקור ${sig.source ?? "לא ידוע"}`,
    ],
  };
}
