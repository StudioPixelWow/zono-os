// ============================================================================
// ZONO Property Radar™ — provider QA public surface.
// Pure layers (validator/normalizer-check/schema/duplicate/statistics/report/
// engine) are client-safe. The repository is server-only and NOT re-exported.
// ============================================================================
export * from "./types";
export { validateListingFields } from "./validator";
export { runNormalizationQA } from "./normalizer-check";
export { buildSchemaFingerprint, detectSchemaChanges } from "./schema";
export { detectCrossProviderDuplicates } from "./duplicate";
export { computeBatchStatistics, statusFromScore } from "./statistics";
export { assembleListingQAReport } from "./report";
export { runProviderQA, type ProviderQADeps } from "./engine";
