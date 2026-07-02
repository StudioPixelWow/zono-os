// ============================================================================
// 🏷️ Seller Agent — scorecard (pure). 29.5. Part 9.
// ============================================================================
import { computeSellerHealth, clamp } from "./health";
import { buildBuyerConnection } from "./buyer-connection";
import { detectSellerRisks, detectSellerOpportunities } from "./risk-opportunity";
import { computeSellerStrategy } from "./strategy";
import { SELLER_STRATEGY_HE, type SellerSignals, type SellerScorecard } from "./types";

export function buildSellerScorecard(sig: SellerSignals): SellerScorecard {
  const health = computeSellerHealth(sig);
  const buyerConnection = buildBuyerConnection(sig);
  const risks = detectSellerRisks(sig);
  const opportunities = detectSellerOpportunities(sig);
  const strategy = computeSellerStrategy(sig, health, buyerConnection);
  const aiRecommendation = `${SELLER_STRATEGY_HE[strategy.recommendedStrategy]} — ${strategy.playbook[0]?.action ?? ""}`;
  return {
    id: sig.id, name: sig.name, classification: sig.classification,
    health, strategy, property: sig.property, risks, opportunities, buyerConnection,
    lifecycleRoles: sig.lifecycleRoles, lifecycleStage: sig.lifecycleStage,
    truthScore: sig.truthScore, aiConfidence: clamp(strategy.confidence), aiRecommendation,
  };
}
