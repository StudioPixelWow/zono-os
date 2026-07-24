// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · AMBIGUOUS-OUTCOME RESOLUTION (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Resolves a Phase-3A/3B ambiguous publish outcome CONSERVATIVELY from provider
// evidence. It NEVER republishes — it only classifies. A single empty lookup is
// never enough to conclude "not published": a configured number of consecutive
// definitive not-found confirmations is required, and any transient failure
// preserves ambiguity. Confirmed-published safely updates local state + creates
// the provider-object mapping if missing; confirmed-not-published MAY make manual
// retry eligible (explicitly). Exhausting attempts escalates to manual review.
// Original attempt + dead-letter history is never rewritten by this decision.
// ============================================================================
import type { ProviderInspectResult } from "./provider-types";

export type AmbiguousResolution =
  | "confirmed_published" | "confirmed_not_published" | "still_ambiguous"
  | "inaccessible" | "permission_lost" | "manual_verification_required";

export interface AmbiguousPolicy { notPublishedConfirmations: number; maxAttempts: number }
export const DEFAULT_AMBIGUOUS_POLICY: AmbiguousPolicy = { notPublishedConfirmations: 2, maxAttempts: 6 };

export interface AmbiguousInput {
  inspect: ProviderInspectResult;
  knownObjectId: string | null;
  /** Consecutive definitive not-found confirmations already recorded. */
  confirmationCount: number;
  attemptCount: number;
  policy?: AmbiguousPolicy;
}

export interface AmbiguousDecision {
  resolution: AmbiguousResolution;
  createMapping: boolean;
  providerObjectId: string | null;
  permalink: string | null;
  makeManualRetryEligible: boolean;
  nextConfirmationCount: number;
  reason: string;
}

/** Resolve one ambiguous outcome from the latest inspection + prior confirmations. */
export function resolveAmbiguous(input: AmbiguousInput): AmbiguousDecision {
  const policy = input.policy ?? DEFAULT_AMBIGUOUS_POLICY;
  const i = input.inspect;

  // Confirmed present → publish actually happened. Safe to reconcile.
  if (i.found && (i.state === "published" || i.state === "exists")) {
    return { resolution: "confirmed_published", createMapping: !input.knownObjectId, providerObjectId: i.providerObjectId, permalink: i.permalink, makeManualRetryEligible: false, nextConfirmationCount: 0, reason: "provider_object_confirmed" };
  }
  // Transient / inconclusive read → keep ambiguity, do not burn a confirmation.
  if (i.ambiguous || i.state === "ambiguous") {
    if (input.attemptCount >= policy.maxAttempts) return { resolution: "manual_verification_required", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: false, nextConfirmationCount: input.confirmationCount, reason: "attempts_exhausted_while_ambiguous" };
    return { resolution: "still_ambiguous", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: false, nextConfirmationCount: input.confirmationCount, reason: "transient_read_preserves_ambiguity" };
  }
  // Permission / accessibility problems are classified distinctly (not "gone").
  if (i.state === "permission_lost") return { resolution: "permission_lost", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: false, nextConfirmationCount: input.confirmationCount, reason: "permission_lost" };
  if (i.state === "inaccessible") {
    if (input.attemptCount >= policy.maxAttempts) return { resolution: "manual_verification_required", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: false, nextConfirmationCount: input.confirmationCount, reason: "inaccessible_after_attempts" };
    return { resolution: "inaccessible", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: false, nextConfirmationCount: input.confirmationCount, reason: "inaccessible_read" };
  }
  // Definitive not-found → accrue a confirmation; only conclude after threshold.
  const next = input.confirmationCount + 1;
  if (next >= policy.notPublishedConfirmations) {
    return { resolution: "confirmed_not_published", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: true, nextConfirmationCount: next, reason: "not_published_confirmed" };
  }
  if (input.attemptCount >= policy.maxAttempts) return { resolution: "manual_verification_required", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: false, nextConfirmationCount: next, reason: "attempts_exhausted_below_threshold" };
  return { resolution: "still_ambiguous", createMapping: false, providerObjectId: null, permalink: null, makeManualRetryEligible: false, nextConfirmationCount: next, reason: "awaiting_more_confirmations" };
}
