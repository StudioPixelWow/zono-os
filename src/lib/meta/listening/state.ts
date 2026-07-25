// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MENTION STATUS MACHINE (PURE). Phase 5.
// ----------------------------------------------------------------------------
// Local, provider-neutral mention status. Status changes are LOCAL + audited — they
// NEVER perform a provider write. A mention is never silently marked resolved from
// an AI suggestion; a human moves it. `unavailable` reflects provider deletion, not
// a user action. Pure guards shared by the server service + QA.
// ============================================================================
import type { MentionStatus } from "./domain";

const TRANSITIONS: Record<MentionStatus, readonly MentionStatus[]> = {
  new: ["reviewed", "actionable", "ignored", "resolved"],
  reviewed: ["actionable", "ignored", "resolved", "new"],
  actionable: ["reviewed", "resolved", "ignored"],
  ignored: ["new", "reviewed"],
  resolved: ["reviewed", "actionable"],
  unavailable: [],                       // terminal (provider removed it) — no user transition
};

/** Whether a user-initiated status change is allowed (pure). */
export function canChangeStatus(from: MentionStatus, to: MentionStatus): { ok: boolean; reason: string | null } {
  if (from === "unavailable") return { ok: false, reason: "unavailable_terminal" };
  if (from === to) return { ok: false, reason: "no_change" };
  return (TRANSITIONS[from] ?? []).includes(to) ? { ok: true, reason: null } : { ok: false, reason: `illegal:${from}->${to}` };
}

/** A resolve is a deliberate user action, never an automatic AI consequence. */
export function isUserResolvable(from: MentionStatus): boolean {
  return from !== "unavailable" && from !== "resolved";
}
