// ============================================================================
// 🎯 Lead Agent — scorecard (pure). 29.6. Part 10.
// ============================================================================
import { computeLeadHealth, clamp } from "./health";
import { computeIntent, computeRouting } from "./intent-routing";
import { detectLeadRisks, detectLeadOpportunities } from "./risk-opportunity";
import { computeLeadStrategy } from "./strategy";
import { LEAD_STRATEGY_HE, ROUTING_HE, type LeadSignals, type LeadScorecard } from "./types";

export function buildLeadScorecard(sig: LeadSignals): LeadScorecard {
  const health = computeLeadHealth(sig);
  const intent = computeIntent(sig);
  const routing = computeRouting(sig, intent);
  const risks = detectLeadRisks(sig, intent);
  const opportunities = detectLeadOpportunities(sig, intent);
  const strategy = computeLeadStrategy(sig, health, intent);
  const aiRecommendation = `${LEAD_STRATEGY_HE[strategy.recommendedStrategy]} · ניתוב: ${ROUTING_HE[routing.target]} — ${strategy.playbook[0]?.action ?? ""}`;
  return {
    id: sig.id, name: sig.name, classification: sig.classification,
    health, intent, routing, strategy, risks, opportunities,
    lifecycleRoles: sig.lifecycleRoles, lifecycleStage: sig.lifecycleStage, relationshipPath: sig.relationshipPath,
    truthScore: sig.truthScore, aiConfidence: clamp(strategy.confidence), aiRecommendation,
  };
}
