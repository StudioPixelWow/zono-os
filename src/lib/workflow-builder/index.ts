// ============================================================================
// 🔁 ZONO — AI Workflow Builder™ — barrel. 30.4.
// Reusable, entity-agnostic workflow state machine that orchestrates existing
// capabilities (read-only). No engine modified; no business logic duplicated;
// every action step is approval-gated; nothing auto-executes. Evidence-only.
// ============================================================================
export { instantiateWorkflow, advanceWorkflow, computeProgress } from "./engine";
export { evaluateCondition } from "./conditions";
export { WORKFLOW_TEMPLATES, getTemplate } from "./templates";
export { runSelfCheck } from "./qa";
export { planExecution, runExecutionSelfCheck } from "./execution";
export { suggestTemplate, runMappingSelfCheck } from "./mapping";
export { listWorkflowTemplates, startWorkflow, buildWorkflowContext } from "./service";
export type { WorkflowTemplateSummary, WorkflowTarget } from "./service";
export { startPersistentWorkflow, advancePersistentWorkflow, getPersistentWorkflow, listActiveWorkflows, listCompletedWorkflows, listPendingApprovalWorkflows, listEntityWorkflows } from "./persist";
export type { WorkflowSummaryRow } from "./repository";
export * from "./types";
