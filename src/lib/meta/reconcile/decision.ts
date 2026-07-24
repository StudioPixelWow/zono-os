// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION DECISION ENGINE (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// The single deterministic, SIDE-EFFECT-FREE brain of reconciliation. It composes
// the lifecycle, ambiguity, drift, repair and verification-policy modules into one
// decision the service applies transactionally. It makes NO provider call and
// mutates NOTHING. It never republishes, never deletes, never concludes deletion
// from a single read (the derived state already respects the evidence threshold),
// and never rewrites immutable history. Same inputs → same decision.
// ============================================================================
import type { ProviderInspectResult, ProviderObjectState } from "./provider-types";
import { detectDrift, type Discrepancy, type DriftInput } from "./drift";
import { planRepair, type RepairPlan } from "./repair";
import { resolveAmbiguous, type AmbiguousDecision, type AmbiguousPolicy } from "./ambiguous";
import { nextVerification, type VerificationSchedule, type VerificationPolicy } from "./policy";

export type ReconcileDecisionKind =
  | "no_change" | "local_state_update" | "provider_object_create" | "discrepancy_open"
  | "discrepancy_update" | "discrepancy_resolve" | "retry_verification" | "manual_review"
  | "retry_publish_eligible" | "blocked";

export type ReconcileJobKind = "post_publish_verify" | "ambiguous_outcome_verify" | "periodic_object_verify" | "webhook_followup" | "manual_verification";

export interface ReconcileInput {
  jobKind: ReconcileJobKind;
  localTargetStatus: string;
  hasMapping: boolean;
  expectedObjectId: string | null;
  expectedPermalink: string | null;
  inspect: ProviderInspectResult;
  derivedState: ProviderObjectState;
  providerFound: boolean;
  confirmationCount: number;
  attemptCount: number;
  objectAgeMs: number;
  timeSincePublishedMs: number;
  capabilityAllowed: boolean;
  connectionHealthy: boolean;
  verificationOverdue: boolean;
  duplicateMapping: boolean;
  impossibleAggregate: boolean;
  externallyTriggered: boolean;
  jitterFraction: number;
  ambiguousPolicy?: AmbiguousPolicy;
  verificationPolicy?: VerificationPolicy;
}

export interface ReconcileDecision {
  kind: ReconcileDecisionKind;
  discrepancies: readonly Discrepancy[];
  repair: RepairPlan | null;
  ambiguous: AmbiguousDecision | null;
  followup: VerificationSchedule;
  makeManualRetryEligible: boolean;
  createMapping: boolean;
  providerObjectId: string | null;
  permalink: string | null;
  blockedReason: string | null;
  healthSignal: "none" | "reconnect_required" | "capability_lost";
  reason: string;
}

/** Compute the reconciliation decision. Pure + total. */
export function decideReconciliation(input: ReconcileInput): ReconcileDecision {
  const followup = nextVerification({ state: input.derivedState, attemptCount: input.attemptCount, objectAgeMs: input.objectAgeMs, timeSincePublishedMs: input.timeSincePublishedMs, externallyTriggered: input.externallyTriggered, policy: input.verificationPolicy, jitterFraction: input.jitterFraction });
  const base = { discrepancies: [] as Discrepancy[], repair: null as RepairPlan | null, ambiguous: null as AmbiguousDecision | null, followup, makeManualRetryEligible: false, createMapping: false, providerObjectId: null as string | null, permalink: null as string | null, blockedReason: null as string | null, healthSignal: "none" as ReconcileDecision["healthSignal"] };

  // Auth/permission evidence → a health signal + blocked verification (retry later).
  if (input.inspect.state === "permission_lost") return { ...base, kind: "blocked", blockedReason: "permission_lost", healthSignal: "reconnect_required", reason: "permission_lost_verification_blocked" };
  if (!input.capabilityAllowed || !input.connectionHealthy) {
    if (input.inspect.ambiguous || !input.providerFound) return { ...base, kind: "blocked", blockedReason: "capability_or_connection_impaired", healthSignal: "capability_lost", reason: "verification_impaired" };
  }

  // Ambiguous-outcome job: run the conservative resolver first.
  let ambiguous: AmbiguousDecision | null = null;
  if (input.jobKind === "ambiguous_outcome_verify" || input.localTargetStatus === "manual_review_required") {
    ambiguous = resolveAmbiguous({ inspect: input.inspect, knownObjectId: input.expectedObjectId, confirmationCount: input.confirmationCount, attemptCount: input.attemptCount, policy: input.ambiguousPolicy });
    if (ambiguous.resolution === "confirmed_published") {
      return { ...base, kind: "local_state_update", ambiguous, createMapping: ambiguous.createMapping, providerObjectId: ambiguous.providerObjectId, permalink: ambiguous.permalink, followup: { schedule: false, delayMs: 0, reason: "resolved_published" }, reason: "ambiguous_resolved_published" };
    }
    if (ambiguous.resolution === "confirmed_not_published") {
      return { ...base, kind: "retry_publish_eligible", ambiguous, makeManualRetryEligible: true, followup: { schedule: false, delayMs: 0, reason: "resolved_not_published" }, reason: "ambiguous_resolved_not_published" };
    }
    if (ambiguous.resolution === "manual_verification_required") return { ...base, kind: "manual_review", ambiguous, followup: { schedule: false, delayMs: 0, reason: "escalated_manual" }, reason: "ambiguous_escalated_manual" };
    if (ambiguous.resolution === "still_ambiguous" || ambiguous.resolution === "inaccessible") return { ...base, kind: "retry_verification", ambiguous, reason: `ambiguous_${ambiguous.resolution}` };
    if (ambiguous.resolution === "permission_lost") return { ...base, kind: "blocked", ambiguous, blockedReason: "permission_lost", healthSignal: "reconnect_required", reason: "ambiguous_permission_lost" };
  }

  // Drift detection over the derived (thresholded) provider state.
  const drift: DriftInput = {
    localTargetStatus: input.localTargetStatus, derivedProviderState: input.derivedState, providerFound: input.providerFound,
    expectedObjectId: input.expectedObjectId, observedObjectId: input.inspect.providerObjectId,
    expectedPermalink: input.expectedPermalink, observedPermalink: input.inspect.permalink,
    capabilityLost: !input.capabilityAllowed, verificationOverdue: input.verificationOverdue,
    duplicateMapping: input.duplicateMapping, impossibleAggregate: input.impossibleAggregate,
  };
  const discrepancies = detectDrift(drift);

  // Confirmed published while local processing / ambiguous, or missing mapping → safe repair.
  const top = discrepancies[0];
  if (top && top.autoRepairable) {
    const repair = planRepair(top, { providerConfirmedPublished: input.providerFound && (input.derivedState === "published" || input.derivedState === "exists"), providerObjectId: input.inspect.providerObjectId, hasMapping: input.hasMapping, observedPermalink: input.inspect.permalink });
    if (repair.actions[0] !== "none") {
      const kind: ReconcileDecisionKind = repair.actions.includes("create_provider_object") ? "provider_object_create" : "local_state_update";
      return { ...base, kind, discrepancies, repair, createMapping: repair.actions.includes("create_provider_object"), providerObjectId: repair.providerObjectId, permalink: repair.permalink, followup: { schedule: false, delayMs: 0, reason: "repaired" }, reason: `safe_repair_${top.type}` };
    }
  }

  // A missing mapping but confirmed present → create mapping (safe).
  if (!input.hasMapping && input.providerFound && (input.derivedState === "published" || input.derivedState === "exists")) {
    return { ...base, kind: "provider_object_create", createMapping: true, providerObjectId: input.inspect.providerObjectId, permalink: input.inspect.permalink, followup: { schedule: false, delayMs: 0, reason: "mapping_created" }, reason: "missing_mapping_created" };
  }

  if (discrepancies.length > 0) return { ...base, kind: "discrepancy_open", discrepancies, reason: `discrepancy_${top.type}` };

  // Transient/inconclusive read with nothing to change → retry verification.
  if (input.inspect.ambiguous && followup.schedule) return { ...base, kind: "retry_verification", reason: "transient_retry" };

  // Confirmed consistent → optionally resolve any prior discrepancy, else no change.
  return { ...base, kind: input.providerFound && (input.derivedState === "published" || input.derivedState === "exists") ? "discrepancy_resolve" : "no_change", reason: "consistent" };
}
