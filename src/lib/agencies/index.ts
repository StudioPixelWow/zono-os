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
// ── Auto-Builder + Clean Identity (Phase 26.2, pure) ─────────────────────────
export { buildAgencyIdentityFromRawText, AUTOBUILD_CREATE_THRESHOLD } from "./identity/agencyAutoBuilder";
export { cleanAgencyName, extractAgencyBranchAndCity, assessNameQuality } from "./identity/agencyNameCleaner";
export { detectAgencyBrand, isListingPlatform } from "./identity/agencyBrandDetector";
export { generateAgencyAliases } from "./identity/agencyAliasGenerator";
export type { AgencyIdentity, AutoBuildInput, BrandDetection, BranchCity, IdentityStatus } from "./identity/agencyIdentityTypes";
// ── Knowledge Graph (Phase 26.3, pure types + helpers) ───────────────────────
export {
  areaKey, relationshipKey, dedupeRelationshipInputs, mergeRelationship,
  computeAreaFootprint, detectTimelineEvents, detectSignals,
  AGENCY_ENTITY_TYPES, AREA_ENTITY_TYPES, ACTIVITY_SPIKE_THRESHOLD,
} from "./graph/agencyGraphTypes";
export type {
  AgencyEntityType, AgencyRelationshipType, AgencyEntityRelationship,
  RelationshipInput, AgencyAreaFootprint, GraphTimelineEvent, GraphSignal,
} from "./graph/agencyGraphTypes";
// ── Territory Dominance (Phase 26.4, pure types + helpers) ───────────────────
export {
  territoryKey, territoryLabel, avgOrNull, medianOrNull, shareOrNull,
  TERRITORY_PERIODS, DEFAULT_TERRITORY_PERIOD,
} from "./territory/agencyTerritoryTypes";
export type {
  TerritoryType, TerritoryTrend, TerritoryPeriodDays, AgencyTerritoryStats,
  TerritoryListingRow, TerritoryTotals, TerritoryPreviousPeriod, TerritoryCalcInput,
  ComputedTerritoryStats, TerritoryOpportunity,
} from "./territory/agencyTerritoryTypes";
export {
  scoreDominance, scoreMomentum, scoreConfidence, saturate, DOMINANCE_WEIGHTS,
} from "./territory/agencyDominanceScoring";
export {
  computeTerritoryStats, detectTerritoryOpportunities,
} from "./territory/agencyTerritoryCalculator";
// ── Scoring Engine (Phase 26.5, pure types + helpers) ────────────────────────
export {
  DEFAULT_SCORE_WEIGHTS, meanPresent, saturate100, clamp as scoreClamp,
} from "./scoring/agencyScoringTypes";
export type {
  AgencyScoreKey, AgencyScoreInput, AgencyScoreResult,
} from "./scoring/agencyScoringTypes";
export { weightedOverall, dataConfidence } from "./scoring/agencyScoreBreakdown";
export { computeAgencyScores, threatAgainstUserArea } from "./scoring/agencyScoreCalculator";
// ── Signals + Timeline Intelligence (Phase 26.6, pure) ───────────────────────
export {
  severityFor, importanceFor, isRiskSignal, SIGNAL_LABEL,
} from "./intelligence/agencySignalTypes";
export type {
  AgencyIntelSignalType, AgencySignalSeverityLevel, AgencySignalStatus,
  AgencyTerritoryLevel, AgencySnapshot, TerritorySnapshot, DetectedAgencySignal,
} from "./intelligence/agencySignalTypes";
export {
  classifyScoreChange, classifyCountChange, crossedUp, crossedDown,
} from "./intelligence/agencyChangeDetector";
export { dedupeKey, metricKey, materiallyChanged, dedupeDetectedBatch } from "./intelligence/agencySignalDedupe";
export { detectAgencySignals as detectAgencySignalsPure } from "./intelligence/agencySignalDetector";
// ── AI SWOT + Executive Agency Summary (Phase 26.7, pure) ────────────────────
export {
  confidenceWord, OPPORTUNITY_SIGNALS, THREAT_SIGNALS,
} from "./reports/agencyReportTypes";
export type {
  AgencyReportType, SwotItem, AgencyRecommendation, AgencyReportSnapshot, AgencyReport,
  SnapshotScores, SnapshotSignal, SnapshotTerritory, SnapshotGraph,
} from "./reports/agencyReportTypes";
export { generateAgencySwot } from "./reports/agencySwotGenerator";
export { generateAgencyExecutiveSummary } from "./reports/agencyExecutiveSummaryGenerator";
export { generateAgencyRecommendations } from "./reports/agencyRecommendationEngine";
