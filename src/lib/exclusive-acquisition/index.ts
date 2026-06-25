// ============================================================================
// ZONO — Seller Intelligence™ & Exclusive Opportunity Engine public surface.
// Pure layers are client-safe; repository + engine are server-only and NOT
// re-exported here.
// ============================================================================
export * from "./types";
export { calculateSellerOpportunityScore, calculateExclusiveProbability, bandFor } from "./scoring";
export { nextLifecycleStage, isAdvancing, LIFECYCLE_LABEL } from "./lifecycle";
export { recommendNextAction, rankContactPriority, computePriorityScore, type RecommendInput } from "./recommendations";
export { summarizeContactHistory, smartFollowupRules, type FollowupContext } from "./touchpoints";
export { evaluateSellerOpportunity, type EvaluateInput, type EvaluateResult } from "./evaluate";
