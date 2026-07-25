// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING STATE MACHINES (PURE). Phase 6.
// ----------------------------------------------------------------------------
// Conversation state (open/assigned/snoozed/resolved), read derivation, and the
// APPROVAL-gated outbound send lifecycle (pending → approved → ready → sent, or
// rejected / manual_review). A send is executable ONLY when explicitly approved —
// never auto. Ambiguous provider outcomes go to manual_review and are NEVER auto-
// retried. Pure guards shared by the server service + QA.
// ============================================================================
import type { ConversationStatus, SendApprovalState, SendStatus } from "./domain";

const CONV_TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  open: ["assigned", "snoozed", "resolved"],
  assigned: ["open", "snoozed", "resolved"],
  snoozed: ["open", "assigned", "resolved"],
  resolved: ["open", "assigned"],
};
export function canTransitionConversation(from: ConversationStatus, to: ConversationStatus): boolean {
  return from === to || (CONV_TRANSITIONS[from] ?? []).includes(to);
}
export function isUnread(lastMessageAt: string | null, lastReadAt: string | null): boolean {
  if (!lastMessageAt) return false;
  if (!lastReadAt) return true;
  return lastMessageAt > lastReadAt;
}

/** A send may be APPROVED only from pending. */
export function canApproveSend(approvalState: SendApprovalState, status: SendStatus): { ok: boolean; reason: string | null } {
  if (approvalState !== "pending") return { ok: false, reason: `not_pending:${approvalState}` };
  if (status !== "pending") return { ok: false, reason: `not_pending_status:${status}` };
  return { ok: true, reason: null };
}
/** A send is EXECUTABLE only when approved + ready (single provider write). */
export function isSendExecutable(approvalState: SendApprovalState, status: SendStatus): boolean {
  return approvalState === "approved" && status === "ready";
}
/** An ambiguous outcome must go to manual review — never an automatic retry. */
export function classifySendOutcome(ok: boolean, ambiguous: boolean): SendStatus {
  if (ok) return "sent";
  return ambiguous ? "manual_review" : "failed";
}
