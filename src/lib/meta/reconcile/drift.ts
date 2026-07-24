// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · DRIFT DETECTION (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Compares canonical ZONO publishing state against derived provider evidence and
// yields first-class discrepancies with a deterministic severity + a safe,
// secret-free summary. It NEVER concludes deletion from a single failed read
// (callers pass an already-derived, evidence-thresholded provider state) and it
// never mutates anything — it only classifies. Auto-repairability is marked only
// for the narrow, evidence-backed cases the repair module is allowed to fix.
// ============================================================================
import type { ProviderObjectState } from "./provider-types";

export type DiscrepancyType =
  | "local_success_provider_missing" | "local_processing_provider_published" | "local_failed_provider_exists"
  | "ambiguous_provider_exists" | "ambiguous_provider_missing" | "provider_deleted" | "provider_hidden"
  | "provider_inaccessible" | "provider_id_mismatch" | "permalink_changed" | "webhook_unmatched"
  | "capability_lost_after_publish" | "verification_overdue" | "duplicate_provider_object" | "impossible_aggregate_state";

export type DiscrepancySeverity = "informational" | "warning" | "action_required" | "critical";

export interface Discrepancy { type: DiscrepancyType; severity: DiscrepancySeverity; autoRepairable: boolean; safeSummary: string }

export interface DriftInput {
  /** Canonical local target status (succeeded/failed/manual_review_required/provider_processing/…). */
  localTargetStatus: string;
  /** Provider state ALREADY derived over the evidence threshold (never a raw single read). */
  derivedProviderState: ProviderObjectState;
  providerFound: boolean;
  expectedObjectId: string | null;
  observedObjectId: string | null;
  expectedPermalink: string | null;
  observedPermalink: string | null;
  capabilityLost: boolean;
  verificationOverdue: boolean;
  duplicateMapping: boolean;
  impossibleAggregate?: boolean;
}

const isAmbiguousLocal = (s: string) => s === "manual_review_required" || s === "ambiguous";
const isProcessing = (s: string) => s === "provider_processing" || s === "executing";

/** Detect all drifts implied by the inputs, most-severe first. Pure. */
export function detectDrift(input: DriftInput): Discrepancy[] {
  const out: Discrepancy[] = [];
  const st = input.derivedProviderState;
  const localSuccess = input.localTargetStatus === "succeeded";

  if (input.impossibleAggregate) out.push({ type: "impossible_aggregate_state", severity: "critical", autoRepairable: false, safeSummary: "aggregate target/operation state is internally inconsistent" });
  if (input.observedObjectId && input.expectedObjectId && input.observedObjectId !== input.expectedObjectId) out.push({ type: "provider_id_mismatch", severity: "critical", autoRepairable: false, safeSummary: "provider object id differs from the stored mapping" });

  if (localSuccess) {
    if (st === "deleted") out.push({ type: "provider_deleted", severity: "critical", autoRepairable: false, safeSummary: "locally published, provider object confirmed deleted" });
    else if (st === "hidden") out.push({ type: "provider_hidden", severity: "warning", autoRepairable: false, safeSummary: "locally published, provider object hidden" });
    else if (st === "inaccessible") out.push({ type: "provider_inaccessible", severity: "warning", autoRepairable: false, safeSummary: "locally published, provider object currently inaccessible" });
    else if (!input.providerFound && (st === "unknown")) out.push({ type: "local_success_provider_missing", severity: "action_required", autoRepairable: false, safeSummary: "locally published, provider object not found (pending confirmation)" });
  }
  if (isProcessing(input.localTargetStatus) && st === "published") out.push({ type: "local_processing_provider_published", severity: "informational", autoRepairable: true, safeSummary: "provider confirmed published while local state still processing" });
  if (input.localTargetStatus === "failed" && input.providerFound && (st === "published" || st === "exists")) out.push({ type: "local_failed_provider_exists", severity: "action_required", autoRepairable: false, safeSummary: "locally failed, but a provider object exists" });
  if (isAmbiguousLocal(input.localTargetStatus)) {
    if (input.providerFound && (st === "published" || st === "exists")) out.push({ type: "ambiguous_provider_exists", severity: "warning", autoRepairable: true, safeSummary: "ambiguous outcome confirmed published by provider" });
    else if (st === "deleted") out.push({ type: "ambiguous_provider_missing", severity: "warning", autoRepairable: false, safeSummary: "ambiguous outcome confirmed not present at provider" });
  }
  if (localSuccess && input.expectedPermalink && input.observedPermalink && input.expectedPermalink !== input.observedPermalink) out.push({ type: "permalink_changed", severity: "informational", autoRepairable: true, safeSummary: "provider permalink changed" });
  if (input.capabilityLost) out.push({ type: "capability_lost_after_publish", severity: "warning", autoRepairable: false, safeSummary: "capability/connection lost after publishing (verification impaired)" });
  if (input.verificationOverdue) out.push({ type: "verification_overdue", severity: "informational", autoRepairable: false, safeSummary: "provider verification is overdue for this object" });
  if (input.duplicateMapping) out.push({ type: "duplicate_provider_object", severity: "action_required", autoRepairable: false, safeSummary: "more than one provider-object mapping references this target" });

  const rank: Record<DiscrepancySeverity, number> = { critical: 0, action_required: 1, warning: 2, informational: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
