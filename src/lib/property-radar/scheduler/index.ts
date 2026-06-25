// ============================================================================
// ZONO Property Radar™ — scheduler public surface.
// ============================================================================
export { runPropertyRadarOrchestrator, isAreaDueForSync } from "./orchestrator";
export type { OrchestratorDeps } from "./orchestrator";
export { calculateAreaPriority, priorityRank } from "./area-priority";
export { canRunSyncForOrg, startOfUtcDayIso, HARD_LIMIT_MULTIPLIER } from "./credit-budget";
export { runHourlyPropertyRadarJob, runDailyPropertyRadarValidationJob } from "./jobs";
export type { DailyValidationSummary } from "./jobs";
export { createOrchestratorDataAccess } from "./data-access";

export type {
  AreaPriority,
  OrchestratorArea,
  RadarSchedulerSettings,
  AreaPriorityContext,
  CreditBudgetDecision,
  OrchestratorDataAccess,
  OrgSchedulerRecord,
  RunOrchestratorInput,
  OrchestratorSummary,
  OrgPlan,
  PlannedArea,
  AreaRunOutcome,
} from "./types";
export { DEFAULT_SCHEDULER_SETTINGS } from "./types";
