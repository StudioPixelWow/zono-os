// ============================================================================
// 🧠 ZONO — AI Broker Brain — barrel. PHASE 50.0.
// The action brain: strategic goal → evidence-backed plan (priorities, approval-
// gated actions, calendar proposals, territory targets, success metrics, progress).
// Reuses Chief-of-Staff, Daily OS, Territory OS, Calendar OS and the Approval
// Bundle Engine — never recomputes. Nothing auto-executes.
// ============================================================================
export {
  BROKER_BRAIN_VERSION, APPROVAL_ONLY_NOTE,
  type BrokerIntent, type Timeframe, type Impact, type ClassifiedGoal,
  type BrokerBrainContext, type BrokerPlan, type PlanPriority, type PlanActionSlot,
  type PlanActionKind, type CalendarProposalLite, type SuccessMetric, type ProgressModel,
  type CtxAcquisition, type ResolvedBundle,
} from "./types";
export { classifyGoal } from "./router";
export { assembleBrokerPlan } from "./planner";
export { getBrokerBrainPlan } from "./service";
export { runSelfCheck } from "./qa";
