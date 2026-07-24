// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MODERATION STATE MACHINE (PURE). Phase 1.
// ----------------------------------------------------------------------------
// The outbound-safety brain for comment moderation. Every moderation action
// (reply/hide/unhide/delete) is APPROVAL-GATED — it is created pending, requires an
// explicit approval before it can execute, and NEVER auto-executes. Execution is a
// single provider write that is NEVER auto-retried; an ambiguous outcome (post-
// transmission timeout) becomes `manual_review_required`, never a blind re-send,
// reusing the exact Phase-3A/3C classification. Pure predicates the engine + QA
// share.
// ============================================================================
import { classifyFailure } from "../publish/classify";
import type { MetaProviderErrorKind } from "../provider/errors";
import type { ModerationKind, ModerationStatus, ModerationApprovalState } from "./domain";

const TRANSITIONS: Record<ModerationStatus, readonly ModerationStatus[]> = {
  pending: ["ready", "cancelled", "blocked"],
  ready: ["executing", "cancelled", "blocked"],
  executing: ["succeeded", "failed", "provider_processing", "manual_review_required"],
  provider_processing: ["succeeded", "failed", "manual_review_required"],
  failed: ["ready"], // an eligible failure may be re-approved/re-run manually
  succeeded: [],
  manual_review_required: [],
  cancelled: [],
  blocked: ["ready", "cancelled"],
};
export const MODERATION_TERMINAL: ReadonlySet<ModerationStatus> = new Set(["succeeded", "cancelled", "manual_review_required"]);
export function canTransitionModeration(from: ModerationStatus, to: ModerationStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Every outbound moderation action requires approval before execution. */
export function approvalRequired(): true { return true; }

/** Is the action approved + ready to be enqueued for execution? */
export function isExecutable(approvalState: ModerationApprovalState, status: ModerationStatus): boolean {
  return approvalState === "approved" && (status === "ready" || status === "pending");
}

export interface ModerationEligibility { eligible: boolean; reason: string | null }

/** Gate an action before it may execute: actor permission + capability + a valid
 *  target + a non-empty reply body when replying. */
export function moderationEligibility(kind: ModerationKind, ctx: { actorCanModerate: boolean; capabilityAllowed: boolean; assetActive: boolean; commentStatus: string; replyText: string | null; approvalState: ModerationApprovalState }): ModerationEligibility {
  if (!ctx.actorCanModerate) return { eligible: false, reason: "not_permitted" };
  if (ctx.approvalState !== "approved") return { eligible: false, reason: "not_approved" };
  if (!ctx.capabilityAllowed) return { eligible: false, reason: "capability_denied" };
  if (!ctx.assetActive) return { eligible: false, reason: "asset_inactive" };
  if (ctx.commentStatus === "deleted") return { eligible: false, reason: "comment_deleted" };
  if (kind === "reply" && (!ctx.replyText || !ctx.replyText.trim())) return { eligible: false, reason: "empty_reply" };
  if (kind === "unhide" && ctx.commentStatus !== "hidden") return { eligible: false, reason: "not_hidden" };
  if (kind === "hide" && ctx.commentStatus === "hidden") return { eligible: false, reason: "already_hidden" };
  return { eligible: true, reason: null };
}

export interface ModerationOutcome { status: ModerationStatus; retryable: boolean; retryClass: string; manualReview: boolean }

/** Classify a provider moderation outcome. Ambiguous → manual review (never re-sent). */
export function classifyModerationOutcome(ok: boolean, ambiguous: boolean, errorKind: string | null): ModerationOutcome {
  if (ok && !ambiguous) return { status: "succeeded", retryable: false, retryClass: "non_retryable", manualReview: false };
  if (ambiguous) return { status: "manual_review_required", retryable: false, retryClass: "ambiguous", manualReview: true };
  const cls = classifyFailure((errorKind ?? "internal") as MetaProviderErrorKind, false);
  if (cls.manualReviewRequired) return { status: "manual_review_required", retryable: false, retryClass: "ambiguous", manualReview: true };
  return { status: "failed", retryable: cls.manualRetryEligible, retryClass: cls.retryClass, manualReview: false };
}
