// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · SUGGESTION STATE + ACCEPT ROUTING (PURE). Phase 4.
// ----------------------------------------------------------------------------
// The suggestion lifecycle (suggested → accepted | dismissed | expired) and the
// deterministic map from an accepted next-best-action to the EXISTING workflow it
// routes into. Acceptance NEVER executes a provider write: it opens/creates a
// reviewable draft, opens the Phase-1 approval-gated moderation action, or routes
// through Phase-3 inbox state — always requiring the existing downstream approval.
// Pure guards shared by the server service + QA.
// ============================================================================
import type { ActionKind, SuggestionStatus } from "./domain";

export function canAccept(status: SuggestionStatus): { ok: boolean; reason: string | null } {
  return status === "suggested" ? { ok: true, reason: null } : { ok: false, reason: `not_actionable:${status}` };
}
export function canDismiss(status: SuggestionStatus): { ok: boolean; reason: string | null } {
  return status === "suggested" ? { ok: true, reason: null } : { ok: false, reason: `not_dismissable:${status}` };
}

/** Where accepting an action routes. NONE of these execute a Meta write. */
export type RouteTarget =
  | "reply_draft"          // create/open a reviewable Copilot reply draft
  | "moderation_action"      // open/create the Phase-1 approval-gated moderation action
  | "inbox_assignment"       // route via existing inbox assignment (local)
  | "inbox_state"            // mark for human review via existing inbox state (local)
  | "spam_review"            // flag as spam candidate for human review (local)
  | "dismiss_only";          // ignore/no_action — dismiss the card only

export const ROUTE_BY_ACTION: Record<ActionKind, RouteTarget> = {
  suggest_reply: "reply_draft",
  prepare_moderation_action: "moderation_action",
  route_to_sales: "inbox_assignment",
  route_to_support: "inbox_assignment",
  escalate: "inbox_state",
  request_human_review: "inbox_state",
  mark_spam_candidate: "spam_review",
  ignore: "dismiss_only",
  no_action: "dismiss_only",
};

/** True iff accepting this action could ONLY ever open a downstream approval /
 *  reviewable draft / local routing — never an automatic provider action. */
export function acceptIsNonExecuting(action: ActionKind): boolean {
  // Every route target is non-executing by construction; this predicate documents
  // + lets QA assert no action maps to a "send"/"execute" target.
  const t = ROUTE_BY_ACTION[action];
  return t === "reply_draft" || t === "moderation_action" || t === "inbox_assignment" || t === "inbox_state" || t === "spam_review" || t === "dismiss_only";
}
