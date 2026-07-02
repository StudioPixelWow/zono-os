// ============================================================================
// 🤖 ZONO Autonomous AI Agent Framework™ — types (pure). 29.1.
// ----------------------------------------------------------------------------
// The UNIVERSAL framework every future ZONO agent reuses. It does NOT implement
// any agent's business logic — it defines the Base Agent, runtime, permissions,
// inbox, scheduler, memory, explainability and performance. Agents OBSERVE →
// REASON → PLAN → PROPOSE missions/tasks → REQUEST APPROVAL → TRACK → LEARN.
// NOTHING executes automatically without permission (AUTO_EXECUTE defaults off).
// Reuses existing engines read-only; no protected engine modified.
// ============================================================================
export const AGENT_FRAMEWORK_VERSION = "29.1";

// Part 2 — registry of future agent types (extensible; any future string).
export type AgentType =
  | "listing" | "buyer" | "seller" | "lead" | "market" | "competition"
  | "office_growth" | "crm" | "marketing" | "calendar" | "communication" | "deal"
  | "daily_briefing" | "mission_followup" | (string & {});

// Part 5 — permissions. AUTO_EXECUTE is never granted by default.
export type AgentPermission =
  | "READ" | "SUGGEST" | "CREATE_MISSION" | "CREATE_TASK" | "CREATE_DRAFT"
  | "REQUEST_APPROVAL" | "AUTO_EXECUTE";

export type AgentStatus = "enabled" | "disabled";
export type ProposalKind = "recommendation" | "mission" | "task" | "draft";
export type Impact = "high" | "medium" | "low";

// Part 7 — scheduler foundation.
export type ScheduleMode =
  | "manual" | "daily" | "weekly" | "on_event" | "on_stale" | "on_risk" | "on_mission_completed";
export interface AgentSchedule { mode: ScheduleMode; hourUtc?: number }

// Part 3 — the context an agent observes (loaded upstream, injected).
export interface AgentContext {
  now: number; orgId: string | null;
  event?: string | null;                 // triggering event (for event-driven runs)
  data: Record<string, unknown>;         // reused-engine outputs (briefing, actionCenter, twins, …)
}

// A proposal an agent produces (never executed by the framework).
export interface AgentProposal {
  kind: ProposalKind; title: string; reason: string; evidence: string[];
  confidence: number; impact: Impact; urgency: number;
  entityType?: string; entityId?: string | null; entityName?: string | null;
  missionType?: string;                  // mission type to create on approval (kind='mission')
  alternatives?: string[]; ifIgnored?: string;
}

// Part 6 — an inbox item (a gated, explained proposal awaiting approval).
export type InboxStatus = "pending" | "approved" | "rejected" | "completed";
export interface AgentInboxItem {
  id: string; agentId: string; agentName: string;
  kind: ProposalKind;
  entity: string; recommendation: string; reason: string; evidence: string[];
  confidence: number; impact: Impact; urgency: number;
  missionType?: string; entityType?: string; entityId?: string | null; entityName?: string | null;
  requiresApproval: boolean;
  status: InboxStatus;
  createdMissionId?: string | null; decisionReason?: string | null;
  blocked: boolean; blockReason: string | null;
  // Part 9 — explainability.
  explain: { why: string; evidence: string[]; recommends: string; ifIgnored: string; confidence: number; alternatives: string[] };
}

// Part 1 — the Base Agent definition (declarative + a pure run()).
export interface AgentDefinition {
  id: string; type: AgentType; name: string; description: string; scope: string;
  permissions: AgentPermission[]; schedule: AgentSchedule;
  run: (ctx: AgentContext) => AgentProposal[];
}

// Part 8 — agent memory (organizational, not LLM): recorded outcomes.
export type AgentEventKind = "recommended" | "approved" | "rejected" | "completed" | "failed" | "ignored";
export interface AgentActionRecord { agentId: string; at: string; kind: AgentEventKind }

// Part 10 — agent performance.
export interface AgentPerformance {
  recommendations: number; approved: number; rejected: number; completed: number;
  failed: number; ignored: number; successRatePct: number; avgImpact: number; falsePositives: number;
}

// A single agent run result.
export interface AgentRunResult {
  agentId: string; agentName: string; ranAt: string;
  proposals: number; inbox: AgentInboxItem[]; blocked: number; skipped: boolean; skipReason: string | null;
}

// Part 1 — the runtime view of an agent (status + health + timings).
export interface AgentView {
  id: string; type: AgentType; name: string; description: string; scope: string;
  permissions: AgentPermission[]; schedule: AgentSchedule; status: AgentStatus;
  lastRunAt: string | null; nextRunAt: string | null;
  health: number; confidence: number; performance: AgentPerformance;
  pendingApprovals: number;
}
