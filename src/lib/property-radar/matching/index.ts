// ============================================================================
// ZONO Property Radar™ — buyer matching public surface.
// The deterministic engine (engine/filters/scoring) is the source of truth;
// explanation is the only AI-pluggable layer. Server-only repository is NOT
// re-exported here to keep this module client-safe.
// ============================================================================
export * from "./types";
export { DEFAULT_FAST_FILTER_CONFIG, fastFilterBuyer } from "./filters";
export { DEFAULT_MATCH_WEIGHTS, matchLevelForScore, scoreBuyerProperty } from "./scoring";
export { deterministicMatchExplainer, buildMatchExplanation } from "./explanation";
export { matchPropertyToBuyers, normalizeListingForMatching } from "./engine";
