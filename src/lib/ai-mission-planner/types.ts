// ============================================================================
// 🎯 AI Mission Planner™ — types (client-safe, pure). Phase 27.4.
// ----------------------------------------------------------------------------
// Reasoning becomes planning; planning does NOT become execution without
// approval. These are the shapes of reviewable, evidence-backed mission DRAFTS.
// Nothing here executes anything — no messages, no tasks, no CRM writes.
// ============================================================================

export const MISSION_PLANNER_VERSION = "27.4.0";

export type MissionSourceType =
  | "reasoning_gateway" | "broker_coach" | "growth_strategy" | "gap_analysis"
  | "action_center" | "alert" | "market_event" | "decision_brain" | "manual";

export type MissionStatus = "draft" | "ready_for_review" | "approved" | "rejected" | "converted" | "expired";
export type MissionPriority = "urgent" | "high" | "medium" | "low";
export type MissionCategory =
  | "acquisition" | "pricing" | "follow_up" | "market_watch" | "seller_risk"
  | "buyer_match" | "competition" | "valuation" | "marketing" | "admin";

export interface MissionEvidence {
  source: string;
  sourceId?: string | null;
  label: string;
  value?: string | null;
  confidence?: number | null;
  url?: string | null;
}

export interface MissionGeneratedFrom { type: string; id?: string | null; label?: string | null }
export interface MissionRelatedEntity { type: string | null; id: string | null }

/** A planner-produced draft, before persistence (no id / timestamps / status). */
export interface MissionDraftInput {
  sourceType: MissionSourceType;
  sourceId?: string | null;
  brokerId?: string | null;
  priority: MissionPriority;
  category: MissionCategory;
  title: string;
  summary?: string | null;
  recommendedAction?: string | null;
  expectedOutcome?: string | null;
  estimatedImpact?: number | null;
  confidence: number;            // 0–100
  relatedEntity: MissionRelatedEntity;
  evidence: MissionEvidence[];
  generatedFrom: MissionGeneratedFrom[];
  blockedBy: string[];
  metadata?: Record<string, unknown>;
}

/** A persisted draft (with id / status / review fields). */
export interface MissionDraft extends MissionDraftInput {
  id: string;
  status: MissionStatus;
  userId: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  convertedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PlanSkipReason =
  | "not_answered" | "insufficient_evidence" | "low_confidence"
  | "unknown_entity" | "unsafe" | "duplicate" | "invalid";

export interface PlanSkip { reason: PlanSkipReason; detail: string }
export interface PlanResult { created: MissionDraftInput[]; skipped: PlanSkip[] }
