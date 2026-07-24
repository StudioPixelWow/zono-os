// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH SAFE READ MODELS. Phase 3A.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. NEVER expose: token, token ref, signed
// provider-delivery URL, storage_ref, raw Graph body, raw scopes, app secret,
// provider request payload, or provider trace id. Only safe status, canonical
// ids, safe error CATEGORY, and a safe permalink are surfaced.
// ============================================================================
import type { PublishOperationRow, PublishTargetRow, PublishAttemptRow } from "./ports";
import { classifyFailure } from "./classify";
import type { MetaProviderErrorKind } from "../provider/errors";

export interface OperationListItemDTO {
  id: string; draftId: string; draftVersionNumber: number; status: string; requestedBy: string | null; requestedAt: string;
  targetCount: number; successfulTargetCount: number; failedTargetCount: number; skippedTargetCount: number;
}
export function toOperationListItem(o: PublishOperationRow): OperationListItemDTO {
  return { id: o.id, draftId: o.draftId, draftVersionNumber: o.draftVersionNumber, status: o.status, requestedBy: o.requestedBy, requestedAt: o.requestedAt, targetCount: o.targetCount, successfulTargetCount: o.successfulTargetCount, failedTargetCount: o.failedTargetCount, skippedTargetCount: o.skippedTargetCount };
}

export interface TargetStatusDTO {
  id: string; platform: string; contentKind: string; status: string;
  providerObjectId: string | null; permalink: string | null; safeErrorKind: string | null; safeErrorMessage: string | null;
  retryable: boolean; retryEligible: boolean; manualReviewRequired: boolean;
}
export function toTargetStatus(t: PublishTargetRow): TargetStatusDTO {
  const manualReview = t.status === "manual_review_required";
  return {
    id: t.id, platform: t.platform, contentKind: t.contentKind, status: t.status,
    providerObjectId: t.providerObjectId, permalink: t.providerPermalink,
    safeErrorKind: t.safeErrorKind, safeErrorMessage: t.safeErrorMessage,
    retryable: t.retryable, retryEligible: t.status === "failed" && t.retryable && !manualReview, manualReviewRequired: manualReview,
  };
}

export interface AttemptSummaryDTO { attemptNumber: number; initiationKind: string; result: string | null; safeErrorKind: string | null; durationMs: number | null; startedAt: string }
export function toAttemptSummary(a: PublishAttemptRow): AttemptSummaryDTO {
  return { attemptNumber: a.attemptNumber, initiationKind: a.initiationKind, result: a.result, safeErrorKind: a.safeErrorKind, durationMs: a.durationMs, startedAt: a.startedAt };
}

export interface OperationDetailDTO {
  operation: OperationListItemDTO;
  contentHashRef: string;
  targets: readonly TargetStatusDTO[];
}
export function toOperationDetail(o: PublishOperationRow, targets: readonly PublishTargetRow[]): OperationDetailDTO {
  return { operation: toOperationListItem(o), contentHashRef: o.contentHash.slice(0, 12), targets: targets.map(toTargetStatus) };
}

export interface RetryEligibilityDTO { targetId: string; eligible: boolean; reason: string | null }

/** Whether the raw failure kind maps to a manual-retry-eligible class (safe view). */
export function isRetryClassEligible(kind: string, ambiguous: boolean): boolean {
  return classifyFailure((kind as MetaProviderErrorKind) ?? "internal", ambiguous).manualRetryEligible;
}
