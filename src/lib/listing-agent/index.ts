// ============================================================================
// 🏠 ZONO Listing Intelligence Agent™ — public surface. 29.3.
// The first real autonomous business agent. Reuses the Agent Framework + every
// intelligence engine read-only. Recommendation-only; nothing auto-executes.
// Registers itself into the agent registry on import.
// ============================================================================
import { agentRegistry } from "@/lib/agent-framework/registry";
import { listingAgent } from "./agent";

// Register the listing agent into the framework (idempotent).
if (!agentRegistry.getAgent(listingAgent.id)) agentRegistry.registerAgent(listingAgent);

export { listingAgent } from "./agent";
export { buildScorecard, buildTimeline, classifyListing } from "./scorecard";
export { computePropertyHealth } from "./health";
export { computeMarketPerformance } from "./market-performance";
export { computeListingStrategy } from "./strategy";
export { detectRisks, detectOpportunities } from "./risk-opportunity";
export { buildRecommendations } from "./recommendations";
export { computeValuationView, confidenceLabelOf, NO_VALUATION, type ValuationInput, type ValuationView, type RangePosition, type ConfidenceLabel } from "./valuation";
export { getListingSignals, getListingScorecards, type ListingScorecardsOverview } from "./service";
export { runSelfCheck, type LASelfCheck, type LACheck } from "./qa";
export { LISTING_AGENT_VERSION, STRATEGY_HE, DOM_HE } from "./types";
export type {
  ListingSignals, PropertyHealth, PropertyRisk, PropertyOpportunity,
  ListingRecommendation, PropertyTimelineEntry, PropertyScorecard,
  MarketPerformance, DomBand, MarketPosition, PerformanceTrend, PerformanceInsight,
  StrategyType, ListingStrategy, SellerAlignment, PlaybookAction, StrategyChange,
} from "./types";
