// ============================================================================
// 🎯 ZONO Lead Intelligence Agent™ — barrel + framework registration. 29.6.
// Registers leadAgent into the shared Agent Framework registry (approval-gated,
// never auto-executes). Re-exports the pure engines + service. No engine modified.
// ============================================================================
import { agentRegistry } from "@/lib/agent-framework/registry";
import { leadAgent } from "./agent";

if (!agentRegistry.getAgent(leadAgent.id)) agentRegistry.registerAgent(leadAgent);

export { leadAgent } from "./agent";
export { computeLeadHealth } from "./health";
export { computeIntent, computeRouting } from "./intent-routing";
export { detectLeadRisks, detectLeadOpportunities } from "./risk-opportunity";
export { computeLeadStrategy } from "./strategy";
export { buildLeadScorecard } from "./scorecard";
export { runSelfCheck } from "./qa";
export { getLeadAgentSignals, getLeadAgentScorecards, type LeadAgentScorecardsOverview } from "./service";
export * from "./types";
