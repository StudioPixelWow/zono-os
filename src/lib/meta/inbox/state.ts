// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX STATE MACHINE (PURE). Phase 3.
// ----------------------------------------------------------------------------
// Deterministic inbox-state transitions + read/unread derivation. Inbox state is
// LOCAL (open/snoozed/archived/resolved, read/unread, assignment) — it never
// touches Meta, so there is no provider write and no approval; the service applies
// these role-gated. Unread is derived from last activity vs last read, so a new
// reply re-flags a previously-read conversation. Pure predicates the service + QA
// share.
// ============================================================================
import type { InboxStatus } from "./domain";

const TRANSITIONS: Record<InboxStatus, readonly InboxStatus[]> = {
  open: ["snoozed", "archived", "resolved"],
  snoozed: ["open", "archived", "resolved"],
  resolved: ["open", "archived"],
  archived: ["open"],
};
export function canTransitionStatus(from: InboxStatus, to: InboxStatus): boolean {
  return from === to || (TRANSITIONS[from] ?? []).includes(to);
}

/** Unread iff there is activity newer than the last read (or never read). */
export function isUnread(lastActivityAt: string | null, lastReadAt: string | null): boolean {
  if (!lastActivityAt) return false;
  if (!lastReadAt) return true;
  return lastActivityAt > lastReadAt;
}

/** A snoozed conversation is "due" (returns to open) once its snooze time passes. */
export function isSnoozeElapsed(status: InboxStatus, snoozedUntil: string | null, nowIso: string): boolean {
  return status === "snoozed" && !!snoozedUntil && snoozedUntil <= nowIso;
}

export type InboxAction = "mark_read" | "mark_unread" | "archive" | "unarchive" | "resolve" | "reopen" | "snooze" | "assign" | "unassign" | "add_label" | "remove_label";

/** Whether a local inbox action is valid for the current status (pure guard). */
export function canApplyAction(action: InboxAction, status: InboxStatus): { ok: boolean; reason: string | null } {
  switch (action) {
    case "archive": return status === "archived" ? { ok: false, reason: "already_archived" } : { ok: true, reason: null };
    case "unarchive": return status === "archived" ? { ok: true, reason: null } : { ok: false, reason: "not_archived" };
    case "resolve": return status === "resolved" ? { ok: false, reason: "already_resolved" } : { ok: true, reason: null };
    case "reopen": return status === "open" ? { ok: false, reason: "already_open" } : { ok: true, reason: null };
    case "snooze": return status === "archived" ? { ok: false, reason: "archived_cannot_snooze" } : { ok: true, reason: null };
    default: return { ok: true, reason: null }; // read/unread/assign/label valid in any status
  }
}
