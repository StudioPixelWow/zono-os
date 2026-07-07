// ============================================================================
// 🛒 ZONO — Marketplace Intelligence — barrel. PHASE 58.0.
// Turns already-imported external listings into acquisition + buyer-match
// opportunities with dedup, price anomaly and market-health-by-area. No scraping;
// internal routing first (external URL secondary only); alerts approval-gated.
// ============================================================================
export {
  MARKETPLACE_INTEL_VERSION, COMPLIANCE_NOTE,
  type SourceInfo, type SourceCompliance, type MarketListing, type ListingRoute,
  type DuplicateInfo, type PriceAnomaly, type MarketOpportunity, type OpportunityKind,
  type AreaHealth, type MarketplaceReport,
} from "./types";
export { SOURCE_REGISTRY, sourceInfo, sourceLabel } from "./registry";
export { internalRoute, detectDuplicate, priceAnomaly, classifyOpportunity, marketHealthByArea } from "./classify";
export { getMarketplaceIntel } from "./service";
export { runSelfCheck } from "./qa";
