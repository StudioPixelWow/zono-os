// ============================================================================
// 🎁 ZONO — Autonomous Office™ · Approval Bundle models. PHASE 44.0.
// When an important event happens, ZONO PREPARES a full recommended action
// bundle. NOTHING auto-executes — every action waits for human approval. The
// bundle is a COMPOSITION layer over existing engines; it stores no data of its
// own (deterministic id, recomputed on demand). No new table.
// ============================================================================

export type BundleEventType =
  | "new_lead" | "new_buyer" | "new_seller" | "new_property" | "external_listing"
  | "facebook_comment" | "whatsapp_hot" | "seller_at_risk" | "buyer_ready"
  | "listing_stale" | "price_opportunity" | "territory_opportunity"
  | "meeting_completed" | "workflow_completed" | "campaign_underperforming";

export type BundleEntityType = "lead" | "buyer" | "seller" | "property" | "territory" | "campaign" | "office";

/** The system an action would create an (approval-gated) artifact in. */
export type TargetSystem =
  | "mission-engine" | "workflow-builder" | "whatsapp" | "draft-studio"
  | "calendar-os" | "facebook" | "marketing-core" | "website-builder" | "notifications";

export type ActionType =
  | "mission" | "workflow" | "whatsapp_draft" | "email_draft" | "calendar_booking"
  | "facebook_action" | "marketing_action" | "landing_suggestion" | "notification";

export type ActionStatus = "proposed" | "approved" | "rejected" | "exists";

export interface BundleAction {
  type: ActionType;
  label: string;
  targetSystem: TargetSystem;
  requiresApproval: boolean;   // always true in 44.0
  canExecute: boolean;         // true = approving CREATES an approval-gated artifact; false = suggestion/link only
  reason: string;
  evidence: string[];
  payload: Record<string, unknown>;  // e.g. { missionType } / { workflowTemplate } / { body, kind } / { bookingKind }
  status: ActionStatus;
}

export type BundleStatus = "pending" | "partially_approved" | "approved" | "rejected";

export interface ApprovalBundle {
  bundleId: string;            // deterministic: `${eventType}:${entityType}:${entityId}`
  orgId: string | null;
  eventType: BundleEventType;
  entityType: BundleEntityType;
  entityId: string;
  title: string;
  summary: string;
  priority: number;            // 0..100
  confidence: number;          // 0..100
  risk: number;                // 0..100
  opportunity: number;         // 0..100
  actions: BundleAction[];
  evidence: string[];
  status: BundleStatus;
}

/** Signals the service feeds in (from existing agents / calendar intelligence). */
export interface BundleSignals {
  name?: string | null;
  heat?: number; risk?: number; score?: number; opportunity?: number;
  journeyStage?: string | null;
  detail?: string | null;
  /** Dedup: artifacts that already exist for this entity. */
  existingMissionTypes?: string[];
  existingWorkflowTemplates?: string[];
}
