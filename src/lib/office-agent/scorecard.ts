// ============================================================================
// 🏢 Office Growth Agent — scorecard (pure). 29.7. Part 9.
// Composes every engine into ONE Office Growth Scorecard for the brokerage.
// ============================================================================
import { computeOfficeHealth, clamp } from "./health";
import { detectInventory, detectBrokerPerformance } from "./inventory-broker";
import { detectCompetitive, analyzePipelines } from "./competitive-pipeline";
import { computeOfficeStrategy } from "./strategy";
import { buildDecisions, detectOfficeRisks, detectOfficeOpportunities } from "./decisions";
import { OFFICE_STRATEGY_HE, type OfficeSignals, type OfficeScorecard } from "./types";

export function buildOfficeScorecard(sig: OfficeSignals): OfficeScorecard {
  const health = computeOfficeHealth(sig);
  const inventory = detectInventory(sig);
  const brokerFindings = detectBrokerPerformance(sig);
  const competitive = detectCompetitive(sig);
  const pipeline = analyzePipelines(sig);
  const strategy = computeOfficeStrategy(sig, health, inventory, brokerFindings, competitive);
  const decisions = buildDecisions(sig, health, inventory, brokerFindings, competitive, pipeline);
  const risks = detectOfficeRisks(sig, health, competitive);
  const opportunities = detectOfficeOpportunities(sig, inventory, competitive);

  const growthScore = health.growthHealth;
  const inventoryScore = health.inventoryHealth;
  const brokerScore = health.brokerProductivity;
  const aiRecommendation = `${OFFICE_STRATEGY_HE[strategy.recommendedStrategy]} — ${strategy.playbook[0]?.action ?? ""} · ${decisions[0] ? decisions[0].title : "ללא החלטה דחופה"}`;

  return {
    id: sig.id, name: sig.name,
    health, growthScore, inventoryScore, brokerScore, marketPosition: health.marketPosition,
    inventory, brokerFindings, competitive, pipeline, strategy, decisions, risks, opportunities,
    truthScore: sig.truthScore, aiConfidence: clamp(strategy.confidence), aiRecommendation,
  };
}
