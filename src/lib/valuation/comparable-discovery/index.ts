// ============================================================================
// 🧭 Comparable Discovery Engine™ — public surface. VAL-QA-10.
// The official comparable-discovery layer for valuation. It scans the WHOLE
// evidence universe (GovMap never short-circuits external listings), dedupes,
// ranks and selects only TRACEABLE comparables — then hands them to the AVM,
// which is unchanged. No formula/MAI/BIE/schema/traceability changes.
// ============================================================================
export { discoverValuationComparables } from "./service";
export { runComparableDiscovery, type DiscoveryOptions } from "./engine";
export { runSelfCheck, type DiscoverySelfCheck, type DiscoveryCheck } from "./qa";
export {
  DISCOVERY_ENGINE_VERSION, RADIUS_LADDER, DEFAULT_MAX_RADIUS_M, EXPANDED_MAX_RADIUS_M,
  MIN_STRONG_COMPARABLES, MIN_TOTAL_COMPARABLES,
} from "./types";
export type {
  DiscoveryInput, DiscoverySubject, DiscoverySourceId, MatchLevel, Candidate,
  SourceScanStat, RadiusStat, DiscoveryFailureMode, ComparableDiscoveryPackage,
} from "./types";
