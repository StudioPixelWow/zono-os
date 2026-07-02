// ============================================================================
// 🏢 ZONO Office Growth Agent™ — barrel + framework registration. 29.7.
// Registers officeGrowthAgent into the shared Agent Framework registry (approval-
// gated, never auto-executes). Re-exports the pure engines + service. No engine
// modified.
// ============================================================================
import { agentRegistry } from "@/lib/agent-framework/registry";
import { officeGrowthAgent } from "./agent";

if (!agentRegistry.getAgent(officeGrowthAgent.id)) agentRegistry.registerAgent(officeGrowthAgent);

export { officeGrowthAgent } from "./agent";
export { computeOfficeHealth } from "./health";
export { detectInventory, detectBrokerPerformance } from "./inventory-broker";
export { detectCompetitive, analyzePipelines } from "./competitive-pipeline";
export { computeOfficeStrategy } from "./strategy";
export { buildDecisions, detectOfficeRisks, detectOfficeOpportunities } from "./decisions";
export { buildOfficeScorecard } from "./scorecard";
export { runSelfCheck } from "./qa";
export { getOfficeAgentSignals, getOfficeGrowthScorecard, type OfficeGrowthOverview } from "./service";
export * from "./types";
