// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · APPROVAL STATE MACHINE (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Deterministic approval transitions with guards. Approval binds to a SPECIFIC
// immutable draft version; approving does NOT publish or queue anything. Editing
// an approved draft invalidates the approval and returns it to `draft`. At most
// one pending request per draft. Permission decisions are passed in (resolved by
// the service from the role model) so the machine stays role-agnostic + testable.
// ============================================================================
import type { DraftStatus, DraftApprovalState } from "./domain";

export type ApprovalAction = "submit" | "approve" | "reject" | "request_changes" | "cancel" | "edit" | "archive" | "restore";

export interface TransitionResult {
  ok: boolean;
  nextStatus: DraftStatus;
  nextApproval: DraftApprovalState;
  /** True when this transition invalidates a prior approval. */
  invalidatesApproval: boolean;
  reason: string | null;
}

const fail = (status: DraftStatus, approval: DraftApprovalState, reason: string): TransitionResult => ({ ok: false, nextStatus: status, nextApproval: approval, invalidatesApproval: false, reason });

/** Pure draft-status transition for an action (no permission check here). */
export function transition(status: DraftStatus, approval: DraftApprovalState, action: ApprovalAction): TransitionResult {
  switch (action) {
    case "submit":
      if (status === "draft" || status === "changes_requested" || status === "rejected") return { ok: true, nextStatus: "in_review", nextApproval: "pending", invalidatesApproval: false, reason: null };
      return fail(status, approval, `cannot submit from ${status}`);
    case "approve":
      if (status === "in_review") return { ok: true, nextStatus: "approved", nextApproval: "approved", invalidatesApproval: false, reason: null };
      return fail(status, approval, `cannot approve from ${status}`);
    case "reject":
      if (status === "in_review") return { ok: true, nextStatus: "rejected", nextApproval: "rejected", invalidatesApproval: false, reason: null };
      return fail(status, approval, `cannot reject from ${status}`);
    case "request_changes":
      if (status === "in_review") return { ok: true, nextStatus: "changes_requested", nextApproval: "changes_requested", invalidatesApproval: false, reason: null };
      return fail(status, approval, `cannot request changes from ${status}`);
    case "cancel":
      if (status === "in_review") return { ok: true, nextStatus: "draft", nextApproval: "not_required", invalidatesApproval: false, reason: null };
      return fail(status, approval, `no pending review to cancel from ${status}`);
    case "edit":
      // Editing during review is blocked (cancel first). Editing an approved draft
      // invalidates the approval and returns it to draft.
      if (status === "in_review") return fail(status, approval, "cannot edit while in review — cancel the request first");
      if (status === "approved") return { ok: true, nextStatus: "draft", nextApproval: "not_required", invalidatesApproval: true, reason: "editing an approved draft invalidated the approval" };
      if (status === "archived") return fail(status, approval, "cannot edit an archived draft");
      return { ok: true, nextStatus: "draft", nextApproval: status === "changes_requested" || status === "rejected" ? "not_required" : approval, invalidatesApproval: false, reason: null };
    case "archive":
      if (status === "archived") return fail(status, approval, "already archived");
      return { ok: true, nextStatus: "archived", nextApproval: approval, invalidatesApproval: false, reason: null };
    case "restore":
      if (status !== "archived") return fail(status, approval, "only archived drafts can be restored");
      return { ok: true, nextStatus: "draft", nextApproval: "not_required", invalidatesApproval: false, reason: null };
    default:
      return fail(status, approval, "unknown action");
  }
}

export interface ApprovalPermissionCtx {
  /** The actor may approve/reject/request-changes (reviewer/approver/manager/owner). */
  canApprove: boolean;
  /** The actor may edit this draft (owner/admin/manager, or creator of own draft). */
  canEdit: boolean;
  isCreator: boolean;
  /** Product policy: may the creator approve their own draft? */
  allowSelfApproval: boolean;
  /** Is there already a pending approval request for this draft? */
  hasPendingRequest: boolean;
}

/** Guard an approval-workflow action against permissions + invariants. */
export function guardApprovalAction(action: ApprovalAction, ctx: ApprovalPermissionCtx): { ok: boolean; reason: string | null } {
  switch (action) {
    case "submit":
      if (!ctx.canEdit) return { ok: false, reason: "not permitted to submit this draft" };
      if (ctx.hasPendingRequest) return { ok: false, reason: "a pending approval request already exists" };
      return { ok: true, reason: null };
    case "approve":
    case "reject":
    case "request_changes":
      if (!ctx.canApprove) return { ok: false, reason: "not permitted to decide approvals" };
      if (action === "approve" && ctx.isCreator && !ctx.allowSelfApproval) return { ok: false, reason: "creators cannot approve their own draft" };
      return { ok: true, reason: null };
    case "cancel":
      if (!ctx.canEdit && !ctx.canApprove) return { ok: false, reason: "not permitted to cancel the request" };
      return { ok: true, reason: null };
    case "edit":
    case "archive":
    case "restore":
      if (!ctx.canEdit) return { ok: false, reason: "not permitted to modify this draft" };
      return { ok: true, reason: null };
    default:
      return { ok: false, reason: "unknown action" };
  }
}
