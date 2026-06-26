// ============================================================================
// ZONO — Agencies public barrel (Phase 26.0). CLIENT-SAFE exports only.
// Server modules (repositories, service) import directly from their files and
// are NOT re-exported here (they pull server-only deps).
// ============================================================================
export * from "./types";
export {
  normalizeAgencyName, agencySlug, normalizePhone, normalizeWebsite, normalizeEmail,
} from "./normalize";
export {
  nameSimilarity, duplicateScore, isLikelyDuplicate, DUPLICATE_THRESHOLD,
  type AgencyLike, type DuplicateScore,
} from "./duplicate-detection";
// ── Identity Resolver (Phase 26.1, pure) ─────────────────────────────────────
export { resolveAgencyText, RESOLVE_ACCEPT, RESOLVE_REVIEW } from "./resolver/resolver";
export { toKnownAgency } from "./resolver/types";
export type {
  ResolutionInput, ResolutionResult, AgencyMatch, KnownAgency, CandidateStatus,
  ResolutionCandidateRecord,
} from "./resolver/types";
