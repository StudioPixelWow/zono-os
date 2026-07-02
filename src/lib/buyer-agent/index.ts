// ============================================================================
// 🛒 ZONO Buyer Intelligence Agent™ — public surface. 29.4.
// Reuses the Agent Framework + Buyer Digital Twin + matches + Customer Journey +
// Relationship Graph + Truth (read-only). Recommendation-only; nothing auto-
// executes. Registers itself into the agent registry on import.
// ============================================================================
import { agentRegistry } from "@/lib/agent-framework/registry";
import { buyerAgent } from "./agent";

if (!agentRegistry.getAgent(buyerAgent.id)) agentRegistry.registerAgent(buyerAgent);

export { buyerAgent } from "./agent";
export { buildBuyerScorecard, buildSellerConnection } from "./scorecard";
export { computeBuyerHealth } from "./health";
export { computeMatchIntel } from "./matching";
export { detectBuyerRisks, detectBuyerOpportunities } from "./risk-opportunity";
export { computeBuyerStrategy } from "./strategy";
export { getBuyerAgentScorecards, getBuyerAgentSignals, type BuyerAgentScorecardsOverview } from "./service";
export { runSelfCheck, type BASelfCheck, type BACheck } from "./qa";
export { BUYER_AGENT_VERSION, BUYER_STRATEGY_HE } from "./types";
export type {
  BuyerSignals, BuyerMatchInput, BuyerHealth, BuyerStrategy, BuyerStrategyType,
  MatchIntel, MatchItem, MatchTier, BuyerRisk, BuyerOpportunity, SellerConnection, BuyerScorecard, PlaybookAction,
} from "./types";
