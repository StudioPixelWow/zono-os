// ============================================================================
// 🕸️ ZONO Multi-Agent Orchestrator™ — barrel. 29.8.
// Pure coordination layer over the existing agents (read-only). No agent/engine
// modified; nothing auto-executes; everything approval-gated.
// ============================================================================
export { buildOrchestratorDashboard } from "./orchestrator";
export { deriveEvents, routeEvents, EVENT_SUBSCRIPTIONS } from "./events";
export { buildOpportunityChains } from "./chains";
export { buildPriorityQueue, detectConflicts } from "./priority-conflicts";
export { buildExecutionPlans } from "./playbooks";
export { runSelfCheck } from "./qa";
export { getOrchestratorDashboard, type OrchestratorOverview } from "./service";
export * from "./types";
