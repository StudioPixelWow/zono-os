// ============================================================================
// 🧭 ZONO Decision Engine™ & Action Planner — public surface. 27.4.
// The single engine that turns existing intelligence into prioritized, evidence-
// based business decisions + actions + risks + opportunities + daily briefings.
// Every future AI feature consumes this. No valuation / MAI / discovery changes.
// ============================================================================
export { getOfficeDecisionPackage, getCityDecisionBriefing } from "./service";
export { computePriority, type PriorityInputs } from "./priority";
export { buildOfficeDecisions, businessScore, aiConfidence } from "./planner";
export { buildRisks, buildOpportunities } from "./risk-opportunity";
export { runSelfCheck, type DESelfCheck, type DECheck } from "./qa";
export { DECISION_ENGINE_VERSION, EXECUTION_HE } from "./types";
export type {
  DecisionCategory, ExecutionReadiness, Impact, Severity, Action, Decision, Risk, Opportunity,
  DecisionPackage, DailyBriefing, OfficeDecisionSignals,
} from "./types";
