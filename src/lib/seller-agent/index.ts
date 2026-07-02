// ============================================================================
// 🏷️ ZONO Seller Intelligence Agent™ — public surface. 29.5.
// Reuses the Agent Framework + Seller Digital Twin + Listing Agent (property/
// valuation/market) + matches + Customer Journey + Relationship Graph + Truth
// (read-only). Recommendation-only; nothing auto-executes. Registers itself into
// the agent registry on import.
// ============================================================================
import { agentRegistry } from "@/lib/agent-framework/registry";
import { sellerAgent } from "./agent";

if (!agentRegistry.getAgent(sellerAgent.id)) agentRegistry.registerAgent(sellerAgent);

export { sellerAgent } from "./agent";
export { buildSellerScorecard } from "./scorecard";
export { computeSellerHealth } from "./health";
export { buildBuyerConnection } from "./buyer-connection";
export { detectSellerRisks, detectSellerOpportunities } from "./risk-opportunity";
export { computeSellerStrategy } from "./strategy";
export { getSellerAgentScorecards, getSellerAgentSignals, type SellerAgentScorecardsOverview } from "./service";
export { runSelfCheck, type SASelfCheck, type SACheck } from "./qa";
export { SELLER_AGENT_VERSION, SELLER_STRATEGY_HE } from "./types";
export type {
  SellerSignals, PropertyIntel, BuyerMatchInput, SellerHealth, SellerStrategy, SellerStrategyType,
  SellerRisk, SellerOpportunity, BuyerConnection, SellerScorecard, PlaybookAction,
} from "./types";
