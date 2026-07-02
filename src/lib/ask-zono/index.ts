// ============================================================================
// 💬 ZONO — Ask ZONO™ Conversational Intelligence — barrel. 30.1.
// Pure conversational layer that makes every existing engine queryable, read-only.
// No engine modified; every action is approval-gated; nothing auto-executes.
// ============================================================================
export { understandQuery } from "./intent";
export { planContext } from "./planner";
export { synthesizeAnswer } from "./synthesis";
export { understandAndPlan, composeResponse, askWithResults } from "./ask";
export { runSelfCheck } from "./qa";
export { askZono } from "./service";
export * from "./types";
