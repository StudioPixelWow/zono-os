// ============================================================================
// 🔬 Office Promotion Explainability™ & Promotion Debugger — public surface. 26.4.17.
// READ-ONLY explainability over the existing candidate promotion. No new engine,
// no AI, no verification-rule changes.
// ============================================================================
export { getPromotionDebug } from "./service";
export { runSelfCheck, type PDSelfCheck, type PDCheck } from "./qa";
export {
  PROMOTION_DEBUG_VERSION, PIPELINE_STAGES, PIPELINE_STAGE_HE,
} from "./types";
export type {
  PromotionStatus, PipelineStage, OfficeCreationOutcome, CheckState, ChecklistItem, FailedRule,
  PromotionScore, PromotionScoreItem, PromotionSimulation, CandidatePromotionDebug, PromotionDebugDashboard,
} from "./types";
