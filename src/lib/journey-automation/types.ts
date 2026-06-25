// ============================================================================
// ZONO — Journey Automation OS™ types (Phase 18, client-safe, no I/O).
// A deterministic ORCHESTRATION layer over the existing engines. Workflows are
// directed graphs (nodes + edges). The executor is deterministic, idempotent,
// retry-safe and queue-backed. AI is OPTIONAL (content/explain only — it never
// triggers, skips conditions, or approves an execution).
// ============================================================================

export type JourneyType = "seller" | "buyer" | "property" | "deal" | "lead" | "office";

export type NodeKind = "trigger" | "condition" | "delay" | "action" | "split" | "merge" | "end";

export type TriggerType =
  | "property_created" | "property_updated" | "price_drop" | "back_on_market"
  | "buyer_match" | "exclusive_opportunity" | "exclusive_signed"
  | "task_completed" | "task_overdue" | "meeting_created" | "meeting_completed"
  | "call_logged" | "whatsapp_sent" | "deal_stage_changed" | "manual" | "scheduled";

export type ConditionField =
  | "opportunity_score" | "buyer_count" | "exclusive_probability" | "seller_score"
  | "role" | "office" | "city" | "neighborhood" | "provider" | "listing_type"
  | "is_private" | "task_status" | "meeting_status" | "time_hour";

export type ConditionOperator = "gte" | "lte" | "gt" | "lt" | "eq" | "neq" | "in" | "contains";

export type ActionType =
  | "create_task" | "assign_user" | "move_stage" | "generate_ai_brief"
  | "generate_whatsapp" | "generate_email" | "create_reminder" | "schedule_meeting"
  | "notify_manager" | "create_alert" | "update_journey" | "wait" | "end";

export type ExecutionStatus = "running" | "completed" | "failed" | "waiting" | "delayed" | "cancelled";
export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed" | "waiting";
export type ExecutionMode = "execution" | "simulation";

// ── Graph ─────────────────────────────────────────────────────────────────--
export interface ConditionClause {
  field: ConditionField;
  operator: ConditionOperator;
  value: number | string | boolean | (number | string)[];
}

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  /** trigger nodes carry a triggerType; action nodes an actionType. */
  triggerType?: TriggerType;
  actionType?: ActionType;
  /** condition nodes carry clauses (AND). */
  conditions?: ConditionClause[];
  /** delay nodes carry a duration. */
  delayMinutes?: number;
  title?: string;
  config?: Record<string, unknown>;
  /** layout only — ignored by the executor. */
  x?: number;
  y?: number;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  /** condition nodes branch on "true" / "false". split nodes fan out (no label). */
  branch?: "true" | "false" | null;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ── Validation ────────────────────────────────────────────────────────────--
export interface ValidationIssue { level: "error" | "warning"; nodeId: string | null; message: string }
export interface ValidationResult { ok: boolean; issues: ValidationIssue[] }

// ── Trigger context (what fired) ──────────────────────────────────────────--
export type TriggerContextValue = number | string | boolean | null | undefined;
export type TriggerContext = Record<string, TriggerContextValue>;

export interface TriggerEvent {
  triggerType: TriggerType;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  context: TriggerContext;
  /** stable key for idempotent dedup of executions. */
  dedupKey?: string;
}

// ── Execution plan / records ──────────────────────────────────────────────--
export interface PlannedStep {
  nodeId: string;
  nodeKind: NodeKind;
  actionType?: ActionType;
  title: string;
  branch: string | null;
  delayMinutes?: number;
}

export interface StepResult {
  nodeId: string;
  nodeKind: NodeKind;
  actionType?: ActionType;
  status: StepStatus;
  attempt: number;
  output: Record<string, unknown>;
  error?: string;
  branch: string | null;
  scheduledAt?: string | null;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  mode: ExecutionMode;
  steps: StepResult[];
  stepsTotal: number;
  stepsDone: number;
  /** node ids that still await a delay (the durable queue must schedule them). */
  pendingDelays: { nodeId: string; runAtOffsetMinutes: number }[];
  audit: AuditEntry[];
  error?: string;
}

// ── SLA ───────────────────────────────────────────────────────────────────--
export interface SlaRule {
  id: string;
  name: string;
  appliesTo: string;
  minutes: number;
  onBreach: { actionType: ActionType; config?: Record<string, unknown> }[];
  active: boolean;
}

export interface SlaEvaluation {
  breached: boolean;
  dueAtOffsetMinutes: number;
  rule: SlaRule | null;
}

// ── Audit + metrics ───────────────────────────────────────────────────────--
export interface AuditEntry {
  eventType: string;
  nodeId: string | null;
  actor: string;
  reason: string;
  detail: Record<string, unknown>;
}

export interface AutomationMetrics {
  tasksAutomated: number;
  callsSaved: number;
  whatsappsGenerated: number;
  meetingsScheduled: number;
  remindersCreated: number;
  responseTimeSavedMinutes: number;
  hoursSaved: number;
  automationSuccessPct: number;
}

export interface ExecutionStatusCounts {
  running: number;
  completed: number;
  failed: number;
  waiting: number;
  delayed: number;
  cancelled: number;
}

export interface AutomationDashboard {
  counts: ExecutionStatusCounts;
  avgDurationMs: number;
  slaCompliancePct: number;
  automationSuccessPct: number;
  metrics: AutomationMetrics;
  recentExecutions: ExecutionSummary[];
  recentAudit: AuditLogRow[];
  workflows: WorkflowSummary[];
  generatedAt: string;
}

export interface ExecutionSummary {
  id: string; workflowName: string | null; journeyType: string | null; status: ExecutionStatus;
  mode: ExecutionMode; entityLabel: string | null; triggerType: string | null;
  startedAt: string | null; durationMs: number | null; slaBreached: boolean; stepsDone: number; stepsTotal: number;
}

export interface WorkflowSummary {
  id: string; name: string; journeyType: string; status: string; activeVersion: number; triggerType: string | null;
}

export interface AuditLogRow {
  id: string; executionId: string | null; nodeId: string | null; eventType: string;
  actor: string; reason: string | null; createdAt: string;
}
