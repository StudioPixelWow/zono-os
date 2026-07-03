// ============================================================================
// 🔁 ZONO — AI Workflow Builder™ — types (pure). 30.4.
// ----------------------------------------------------------------------------
// ONE reusable, entity-agnostic Workflow Engine that ORCHESTRATES existing ZONO
// capabilities (missions, drafts, tasks, approvals) as an explainable state
// machine: trigger → conditions → ordered steps → status/history/progress. It
// does NOT implement any business logic — steps describe approval-gated proposals
// that flow to the EXISTING systems. NOTHING executes automatically; every action
// step is approval-gated. Evidence-only; no engine modified.
// ============================================================================
export const WORKFLOW_BUILDER_VERSION = "30.4";

export type EntityKind = "buyer" | "seller" | "lead" | "broker" | "office" | "property" | "mission" | "customer";
export const ENTITY_HE: Record<EntityKind, string> = {
  buyer: "קונה", seller: "מוכר", lead: "ליד", broker: "מתווך", office: "משרד", property: "נכס", mission: "משימה", customer: "לקוח",
};

// Part 2 — triggers.
export type TriggerType =
  | "MISSION_CREATED" | "BUYER_HOT" | "SELLER_AT_RISK" | "LISTING_STALE" | "OPPORTUNITY_CHAIN"
  | "ASK_ZONO_REC" | "AGENT_PROPOSAL" | "MANUAL";
export const TRIGGER_HE: Record<TriggerType, string> = {
  MISSION_CREATED: "משימה נוצרה", BUYER_HOT: "קונה נהיה חם", SELLER_AT_RISK: "מוכר בסיכון", LISTING_STALE: "נכס מתיישן",
  OPPORTUNITY_CHAIN: "שרשרת הזדמנות", ASK_ZONO_REC: "המלצת Ask ZONO", AGENT_PROPOSAL: "הצעת סוכן", MANUAL: "ידני",
};

// Part 3 — conditions.
export type ConditionType = "TRUTH_SCORE" | "CONFIDENCE" | "BUSINESS_SCORE" | "RELATIONSHIP" | "JOURNEY_STAGE" | "MISSION_STATE" | "TIME";
export type ConditionOp = "gte" | "lte" | "eq" | "neq" | "in";
export interface Condition { type: ConditionType; op: ConditionOp; value: number | string | string[]; label: string }

// Part 4 — actions (all approval-gated).
export type ActionType = "CREATE_MISSION" | "CREATE_DRAFT" | "CREATE_TASK" | "REQUEST_APPROVAL" | "NOTIFY_USER" | "SCHEDULE_FOLLOWUP";
export const ACTION_HE: Record<ActionType, string> = {
  CREATE_MISSION: "צור משימה", CREATE_DRAFT: "צור טיוטה", CREATE_TASK: "צור מטלה", REQUEST_APPROVAL: "בקש אישור", NOTIFY_USER: "התרעה למשתמש", SCHEDULE_FOLLOWUP: "קבע מעקב",
};

export type StepKind = "condition" | "action" | "wait";
export type StepStatus = "pending" | "active" | "waiting_approval" | "completed" | "blocked" | "cancelled" | "skipped";
export const STEP_STATUS_HE: Record<StepStatus, string> = {
  pending: "ממתין", active: "פעיל", waiting_approval: "ממתין לאישור", completed: "הושלם", blocked: "חסום", cancelled: "בוטל", skipped: "דולג",
};

export interface WorkflowStep {
  id: string; order: number; title: string; kind: StepKind;
  action: ActionType | null; missionType: string | null;
  condition: Condition | null; requiresApproval: boolean;
  status: StepStatus; why: string; blockedReason: string | null; outcome: string | null;
}

// Part 5 — template.
export interface WorkflowTemplate {
  id: string; name: string; entityKind: EntityKind; trigger: TriggerType;
  description: string; expectedOutcome: string;
  steps: Omit<WorkflowStep, "status" | "blockedReason" | "outcome">[];
}

export type WorkflowStatus = "draft" | "running" | "waiting_approval" | "blocked" | "completed" | "cancelled";
export const WORKFLOW_STATUS_HE: Record<WorkflowStatus, string> = {
  draft: "טיוטה", running: "פעיל", waiting_approval: "ממתין לאישור", blocked: "חסום", completed: "הושלם", cancelled: "בוטל",
};

export interface WorkflowHistoryEntry { at: string; stepId: string | null; event: string; note: string }

// Part 7 — explainability.
export interface WorkflowExplain { whyStarted: string; whyWaiting: string | null; whyBlocked: string | null; expectedOutcome: string; confidence: number }

// Part 6 — progress / timeline.
export interface WorkflowProgress { total: number; completed: number; pending: number; blocked: number; cancelled: number; percent: number; currentStepId: string | null }

// Part 1 — the workflow instance.
export interface Workflow {
  id: string; version: string; createdAt: string;
  templateId: string; name: string;
  entityKind: EntityKind; entityId: string; entityName: string;
  trigger: TriggerType; status: WorkflowStatus;
  steps: WorkflowStep[]; history: WorkflowHistoryEntry[];
  progress: WorkflowProgress; explain: WorkflowExplain;
}

// Part 3 — condition-evaluation context (assembled from existing engines).
export interface WorkflowContext {
  truthScore: number | null; confidence: number; businessScore: number;
  relationshipStrength: number | null; journeyStage: string | null; missionState: string | null;
  now: number;
}

// Engine events (user-driven — nothing auto-executes).
export type WorkflowEventKind = "approve" | "reject" | "complete_step" | "block" | "cancel";
export interface WorkflowEvent { kind: WorkflowEventKind; stepId?: string; note?: string }
