// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SAFE AUTO-REPAIR (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Plans ONLY narrow, evidence-backed LOCAL-state repairs. It can mark a local
// target published (when the provider confirms it), create a missing provider-
// object mapping, update a changed permalink, or refresh an operation aggregate.
// It can NEVER publish, edit, delete, or recreate provider content; never conclude
// deletion from a single failed read; never touch an immutable draft snapshot or
// attempt history. Every planned repair is idempotent and evidence-tagged so the
// service can apply it once and audit it. Pure: (discrepancy + evidence) → plan.
// ============================================================================
import type { Discrepancy } from "./drift";

export type RepairAction = "none" | "mark_target_published" | "create_provider_object" | "update_permalink" | "refresh_operation_aggregate";

export interface RepairEvidence {
  providerConfirmedPublished: boolean;
  providerObjectId: string | null;
  hasMapping: boolean;
  observedPermalink: string | null;
}

export interface RepairPlan {
  actions: readonly RepairAction[];
  providerObjectId: string | null;
  permalink: string | null;
  idempotent: true;
  reason: string;
}

const NONE: RepairPlan = { actions: ["none"], providerObjectId: null, permalink: null, idempotent: true, reason: "not_auto_repairable" };

/** Plan a safe local repair for a discrepancy, only when evidence permits. */
export function planRepair(discrepancy: Discrepancy, evidence: RepairEvidence): RepairPlan {
  if (!discrepancy.autoRepairable) return NONE;

  switch (discrepancy.type) {
    case "local_processing_provider_published":
    case "ambiguous_provider_exists": {
      if (!evidence.providerConfirmedPublished || !evidence.providerObjectId) return NONE; // never mark success without evidence
      const actions: RepairAction[] = ["mark_target_published", "refresh_operation_aggregate"];
      if (!evidence.hasMapping) actions.unshift("create_provider_object");
      return { actions, providerObjectId: evidence.providerObjectId, permalink: evidence.observedPermalink, idempotent: true, reason: "provider_confirmed_published" };
    }
    case "permalink_changed": {
      if (!evidence.observedPermalink) return NONE;
      return { actions: ["update_permalink"], providerObjectId: evidence.providerObjectId, permalink: evidence.observedPermalink, idempotent: true, reason: "permalink_updated_from_provider" };
    }
    default:
      return NONE;
  }
}

/** Guard: a repair plan must never contain a provider-mutating action. */
const PROVIDER_MUTATING = new Set(["publish", "delete", "edit", "recreate", "hide"]);
export function isRepairPlanSafe(plan: RepairPlan): boolean {
  return plan.actions.every((a) => !PROVIDER_MUTATING.has(a));
}
