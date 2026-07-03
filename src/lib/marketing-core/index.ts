// ============================================================================
// 📣 ZONO — Marketing Core™ — barrel. 33.0.
// The centralized Marketing Operating System foundation. Reuses existing engines;
// plans/budgets/approves but NEVER publishes. Nothing auto-executes.
// ============================================================================
export { recommendBudget } from "./budget";
export { buildAudiences, audiencesFor } from "./audiences";
export { defaultApprovals, setApproval, approvalStatus, canAdvance, pendingGates } from "./approval";
export { computeAnalytics, marketingHealth } from "./analytics";
export { createCampaign, validateCampaign, nextStatus, priorityScore, type CampaignSeed } from "./campaign";
export { buildPlan, buildInsights, composeWorkspace } from "./planning";
export { buildCalendar, withProposedDates } from "./calendar";
export { runSelfCheck } from "./qa";
export { getMarketingWorkspace, askMarketing, proposeCampaignActions } from "./service";
export * from "./types";
