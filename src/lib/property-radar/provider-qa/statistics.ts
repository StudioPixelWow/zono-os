// ============================================================================
// ZONO Property Radar™ — batch QA statistics + status (pure).
// Aggregates per-listing reports + duplicate groups into provider-level metrics
// and derives the health status from the average quality score.
// ============================================================================
import { QA_DEGRADED_SCORE, QA_WARNING_SCORE } from "./types";
import type {
  DuplicateGroup,
  ListingQAReport,
  ProviderQAStatistics,
  ProviderQAStatus,
} from "./types";

export function computeBatchStatistics(
  reports: ListingQAReport[],
  duplicates: DuplicateGroup[],
): ProviderQAStatistics {
  const scanned = reports.length;
  const accepted = reports.filter((r) => r.accepted);
  const rejected = scanned - accepted.length;

  let qualitySum = 0;
  let completenessSum = 0;
  let normalizationErrors = 0;
  let missingPhones = 0;
  let missingImages = 0;
  for (const r of reports) {
    qualitySum += r.normalization.qualityScore;
    completenessSum += r.normalization.fieldsCompleteness;
    if (r.normalization.issues.some((i) => i.severity === "high" || i.code === "price_not_numeric")) normalizationErrors++;
    if (r.normalization.issues.some((i) => i.code === "phone_missing" || i.code === "phone_invalid")) missingPhones++;
    if (r.normalization.cleaned.images.length === 0) missingImages++;
  }

  const duplicateCount = duplicates.reduce((a, g) => a + Math.max(0, g.members.length - 1), 0);
  const duplicateRate = scanned > 0 ? Math.round((duplicateCount / scanned) * 1000) / 10 : 0;

  return {
    scanned,
    rejected,
    normalizationErrors,
    avgQualityScore: scanned > 0 ? Math.round(qualitySum / scanned) : 100,
    avgFieldsCompleteness: scanned > 0 ? Math.round(completenessSum / scanned) : 0,
    missingPhones,
    missingImages,
    duplicateCount,
    duplicateRate,
  };
}

/** ok ≥ 80 · warning 60–79 · degraded < 60 (by average quality score). */
export function statusFromScore(avgQualityScore: number): ProviderQAStatus {
  if (avgQualityScore < QA_DEGRADED_SCORE) return "degraded";
  if (avgQualityScore < QA_WARNING_SCORE) return "warning";
  return "ok";
}
