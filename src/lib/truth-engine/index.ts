// ============================================================================
// 🛡️ ZONO Truth Engine™ & Data Reliability Framework — public surface. 27.7.
// The single authority for data quality, evidence quality, freshness,
// verification and trustworthiness. Every entity, relationship, recommendation
// and insight gets ONE measurable Truth Score derived from real evidence.
// Reuses continuous-learning freshness; the Chief of Staff consumes Truth Scores
// (read-only). No modification to Discovery / Knowledge Graph / Decision /
// Mission / Chief of Staff / Valuation / MAI.
// ============================================================================
export { computeTruthScore, clamp } from "./truth-score";
export { buildEvidenceGraph } from "./evidence-graph";
export { detectContradictions, contradictionPenalty } from "./contradiction";
export { freshnessLevel, freshnessText, freshnessScore, daysSince } from "./freshness";
export { computeDataHealth, buildExecutiveTrust } from "./data-health";
export { getOrgTruthReport } from "./service";
export { runSelfCheck, type TESelfCheck, type TECheck } from "./qa";
export {
  TRUTH_ENGINE_VERSION, FRESHNESS_HE, VERIFICATION_HE, CONTRADICTION_HE,
} from "./types";
export type {
  TruthEntityType, FreshnessLevel, VerificationLevel, Severity, ContradictionField,
  EvidenceItem, EvidenceGraph, Contradiction, TrustExplanation, TruthScore,
  ContradictionSignals, TruthInput, DataHealth, ExecutiveTrust, OrgTruthReport,
} from "./types";
