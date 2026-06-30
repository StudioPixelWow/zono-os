// ============================================================================
// Evidence Search Engine™ v1 — public surface. One unified evidence retrieval
// layer for valuations and future intelligence modules. FIND / NORMALIZE / RANK
// / EXPLAIN only — never calculates a valuation, never changes any formula.
// ============================================================================
export { getPropertyEvidence } from "./service";
export { runEvidenceSearch, type EvidenceSubject, type EvidenceOptions } from "./engine";
export { evidenceQA, type QaCheck } from "./qa";
export {
  normalizeCity, normalizeNeighborhood, normalizeStreet, normalizeHouseNumber, haversineMeters,
} from "./normalizers";
export { MATCH_LEVEL_HE, FAILURE_MODE_HE, classifyFailure, recommendedStep } from "./explain";
export type {
  EvidenceSearchInput, EvidencePackage, EvidenceRow, SourceDiag, ResolvedAddress,
  MatchLevel, EvidenceSourceId, FailureMode, Comparable, ComparableSource,
} from "./types";
