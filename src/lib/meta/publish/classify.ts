// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · FAILURE CLASSIFICATION (PURE). Phase 3A.
// ----------------------------------------------------------------------------
// Maps the canonical MetaProviderError taxonomy to a target outcome class. An
// AMBIGUOUS write (timeout/lost-response AFTER the request may have reached Meta)
// is NEVER marked safely retryable — it becomes `manual_review_required` and
// preserves state for future (Phase-3C) reconciliation. No auto-retry decision.
// ============================================================================
import type { MetaProviderErrorKind } from "../provider/errors";

export type FailureCategory = "retryable_manual" | "reconnect_required" | "config_required" | "ambiguous" | "permanent";

export interface FailureClassification {
  category: FailureCategory;
  manualRetryEligible: boolean;
  manualReviewRequired: boolean;
  retryClass: string;
}

const RETRYABLE_MANUAL: ReadonlySet<MetaProviderErrorKind> = new Set(["rate_limited", "timeout", "transient_provider", "media_processing", "unavailable", "network"]);
const RECONNECT: ReadonlySet<MetaProviderErrorKind> = new Set(["authentication", "authorization", "token_expired", "token_revoked", "asset_disconnected"]);
const CONFIG: ReadonlySet<MetaProviderErrorKind> = new Set(["permission_missing", "app_review_required", "business_verification_required", "unsupported_capability", "invalid_media", "invalid_request", "policy_restricted", "asset_not_found", "duplicate_operation", "conflict"]);

/**
 * Classify a target failure. `ambiguous` marks a write whose acceptance by Meta
 * is unknown (timeout/lost response after transmission) — it must NOT be
 * auto-retried and is surfaced for manual review, not manual retry.
 */
export function classifyFailure(kind: MetaProviderErrorKind, ambiguous = false): FailureClassification {
  if (ambiguous) return { category: "ambiguous", manualRetryEligible: false, manualReviewRequired: true, retryClass: "ambiguous" };
  if (RETRYABLE_MANUAL.has(kind)) return { category: "retryable_manual", manualRetryEligible: true, manualReviewRequired: false, retryClass: "retryable" };
  if (RECONNECT.has(kind)) return { category: "reconnect_required", manualRetryEligible: false, manualReviewRequired: false, retryClass: "retry_after_reauth" };
  if (CONFIG.has(kind)) return { category: "config_required", manualRetryEligible: false, manualReviewRequired: false, retryClass: "non_retryable" };
  return { category: "permanent", manualRetryEligible: false, manualReviewRequired: false, retryClass: "non_retryable" };
}

/** Whether an error kind (with the ambiguity flag) is eligible for MANUAL retry. */
export function isManualRetryEligible(kind: MetaProviderErrorKind, ambiguous: boolean): boolean {
  return classifyFailure(kind, ambiguous).manualRetryEligible;
}
