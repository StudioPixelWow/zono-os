// ============================================================================
// 🚀 ZONO Universal Mission Engine™ — types (client-safe, pure). Phase 27.5.
// ----------------------------------------------------------------------------
// Turns Decisions into executable Missions → Tasks. ENTITY-AGNOSTIC: a mission
// can belong to ANY business entity (office, broker, property, seller, buyer,
// lead, territory, valuation, campaign, …). Nothing auto-executes — every
// mission/task carries an explicit execution-readiness. Evidence-only. Reuses
// the Decision Engine (read-only); no valuation / discovery / intel changes.
// ============================================================================
export const MISSION_ENGINE_VERSION = "27.5";

// Entity-agnostic — known constants plus any future string.
export type EntityType =
  | "organization" | "office" | "broker" | "property" | "seller" | "buyer"
  | "lead" | "project" | "territory" | "neighborhood" | "street" | "market"
  | "valuation" | "campaign" | (string & {});

// Mission types — extensible; unknown types fall back to a generic task plan.
export type MissionType =
  | "RECRUIT_BROKER" | "EXPAND_TERRITORY" | "RECOVER_LISTINGS" | "SELLER_OPPORTUNITY"
  | "BUYER_OPPORTUNITY" | "LEAD_FOLLOWUP" | "MARKETING_CAMPAIGN" | "BROKER_FOLLOWUP"
  | "PROPERTY_FOLLOWUP" | "COMPETITIVE_RESPONSE" | "OFFICE_CLEANUP" | "VALUATION_REVIEW"
  | "MARKET_RESEARCH" | "PORTFOLIO_REVIEW" | "GENERAL" | (string & {});

export type ExecStatus =
  | "READY" | "WAITING_FOR_DATA" | "WAITING_FOR_APPROVAL" | "BLOCKED"
  | "IN_PROGRESS" | "DONE" | "CANCELLED";
export const EXEC_STATUS_HE: Record<string, string> = {
  READY: "מוכן", WAITING_FOR_DATA: "ממתין לנתונים", WAITING_FOR_APPROVAL: "ממתין לאישור",
  BLOCKED: "חסום", IN_PROGRESS: "בביצוע", DONE: "הושלם", CANCELLED: "בוטל",
};
export type Impact = "high" | "medium" | "low";

export interface MissionTask {
  id: string; title: string; order: number; status: ExecStatus;
  effort: Impact; note: string | null;
}

export interface MissionHistoryEntry { at: string; event: string; detail: string | null }

export interface Mission {
  id: string;
  organizationId: string | null;
  sourceDecision: string | null;
  entityType: EntityType; entityId: string | null; entityName: string | null;
  missionType: MissionType;
  priority: number;                 // 0..100
  businessImpact: Impact; confidence: number; reason: string;
  goal: string; expectedOutcome: string;
  status: ExecStatus; owner: string | null;
  tasks: MissionTask[]; history: MissionHistoryEntry[]; evidence: string[];
  createdAt: string; updatedAt: string; dueAt: string | null; completedAt: string | null;
  createdBy: string | null;
  // Explainability (Part 11) — derived, never fabricated.
  explain: { why: string; fromDecision: string | null; businessImpact: Impact; expectedRoi: string; confidence: number; ifIgnored: string };
  followUps: string[];              // AI follow-up suggestions (recommendation-only)
}

export interface CreateMissionInput {
  organizationId?: string | null;
  sourceDecision?: string | null;
  entityType: EntityType; entityId?: string | null; entityName?: string | null;
  missionType: MissionType;
  priority?: number; businessImpact?: Impact; confidence?: number;
  reason: string; goal?: string; expectedOutcome?: string;
  evidence?: string[]; owner?: string | null; dueAt?: string | null; createdBy?: string | null;
  status?: ExecStatus;
}

export interface ActionCenter {
  organizationId: string | null;
  totals: { active: number; blocked: number; waiting: number; inProgress: number; completed: number; today: number };
  todaysMissions: Mission[];
  critical: Mission[]; highPriority: Mission[];
  blocked: Mission[]; waiting: Mission[]; inProgress: Mission[];
  upcoming: Mission[]; recentlyCreated: Mission[]; completed: Mission[];
  todaysTasks: { missionId: string; missionTitle: string; task: MissionTask }[];
  executionScore: number;           // 0..100 (completion vs open, weighted by priority)
  completionRatePct: number;
  notes: string[];
  version: string;
}
