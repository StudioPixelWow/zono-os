// ============================================================================
// ZONO — Facebook GROUPS publishing: LOST-ACK / RECONCILIATION core.
// ----------------------------------------------------------------------------
// PURE, dependency-free state machine (no server-only, no Supabase, no clock).
// The browser-assisted Groups path submits a post to Facebook through a human +
// the Chrome extension. The acknowledgement ("it published") can be LOST (the
// extension crashes, the tab closes, the network drops) AFTER the human already
// posted. If ZONO blindly retried, it would DOUBLE-POST to a real group.
//
// This module encodes the safety contract:
//   • A submitted target whose ack is lost moves to `awaiting_reconciliation`.
//   • While awaiting reconciliation, NO automatic re-post happens and retry is
//     BLOCKED — until reconciliation confirms published / not-published, OR an
//     authorized manager makes an audited manual decision.
//   • The provider "submit" side effect is REQUESTED by the caller, never done
//     here; the core signals `providerSubmitRequested` at most once per allowed
//     attempt, so a lost-ack target is submitted to Facebook AT MOST ONCE.
//   • Duplicate extension callbacks are no-ops (idempotent); conflicting ones
//     move to `needs_review` instead of silently overwriting.
//   • Every real transition appends exactly one append-only event; no-ops append
//     nothing (no duplicate audit/state events).
//   • Cross-org target/callback references are rejected. Emergency-stop blocks
//     any submission or retry.
//
// Determinism: the caller passes `now` (ISO) and event ids in — the core has no
// hidden clock or randomness, so it is fully unit-testable and replayable.
// ============================================================================

export type PublishState =
  | "ready" //                    prepared, not yet submitted to the provider
  | "submitted" //                provider submit issued; awaiting confirmation
  | "awaiting_reconciliation" //  ack lost — MUST reconcile before any retry
  | "needs_review" //             conflicting signals — human review required
  | "pending_retry" //            a new attempt on the SAME target is authorized
  | "published" //                confirmed published (terminal)
  | "failed_permanent" //         permanent failure (terminal, no retry)
  | "cancelled"; //               explicitly cancelled (terminal)

export const TERMINAL_STATES: PublishState[] = ["published", "failed_permanent", "cancelled"];

export type CallbackOutcome =
  | "published" //        the human/extension confirms the post is live
  | "not_published" //    reconciliation proves nothing was posted
  | "failed_permanent" // a non-retryable failure (blocked group, removed, etc.)
  | "failed_transient"; // a retryable failure (network, transient extension err)

export type ManagerDecision = "published" | "allow_retry";

export interface Target {
  id: string;
  orgId: string;
  groupId: string;
  state: PublishState;
  attemptCount: number;
  idempotencyKey: string; // stable identity for (content × group) submission
  providerPostId: string | null;
  submittedAt: string | null;
  reconciledAt: string | null;
  terminal: boolean;
  lastCallbackId: string | null;
  lastCallbackOutcome: CallbackOutcome | null;
}

export type EventKind =
  | "submit"
  | "retry_submit"
  | "ack_lost"
  | "confirmed_published"
  | "confirmed_not_published"
  | "transient_failure"
  | "failed_permanent"
  | "callback_duplicate_ignored"
  | "callback_conflict"
  | "manual_confirmed_published"
  | "manual_allow_retry"
  | "emergency_blocked"
  | "cross_org_rejected"
  | "retry_blocked";

export interface PublishEvent {
  id: string;
  targetId: string;
  orgId: string;
  fromState: PublishState;
  toState: PublishState;
  kind: EventKind;
  actorId: string | null;
  callbackId: string | null;
  reason: string | null;
  occurredAt: string;
}

export interface Decision {
  ok: boolean; //                   the operation was accepted
  noop: boolean; //                 accepted but nothing changed (idempotent)
  error: string | null; //          machine code when ok === false
  target: Target; //                the target after the operation
  events: PublishEvent[]; //         append-only events produced (0 or 1)
  providerSubmitRequested: boolean; // caller must perform ONE provider submit
}

interface BaseCtx {
  callerOrgId: string; // org of the authenticated caller — must match target
  now: string; //        ISO timestamp supplied by the caller (no hidden clock)
  eventId: string; //    id to stamp on any produced event
  actorId?: string | null;
}

function clone(t: Target): Target {
  return { ...t };
}

function ev(
  t: Target,
  from: PublishState,
  to: PublishState,
  kind: EventKind,
  ctx: BaseCtx,
  extra?: { callbackId?: string | null; reason?: string | null },
): PublishEvent {
  return {
    id: ctx.eventId,
    targetId: t.id,
    orgId: t.orgId,
    fromState: from,
    toState: to,
    kind,
    actorId: ctx.actorId ?? null,
    callbackId: extra?.callbackId ?? null,
    reason: extra?.reason ?? null,
    occurredAt: ctx.now,
  };
}

/** Reject any operation whose caller org does not own the target. No side effects. */
function crossOrgGuard(t: Target, ctx: BaseCtx): Decision | null {
  if (t.orgId !== ctx.callerOrgId) {
    return {
      ok: false,
      noop: false,
      error: "cross_org_rejected",
      target: clone(t),
      events: [],
      providerSubmitRequested: false,
    };
  }
  return null;
}

/** Create a fresh target in `ready`. Pure factory. */
export function prepareTarget(input: {
  id: string;
  orgId: string;
  groupId: string;
  idempotencyKey: string;
}): Target {
  return {
    id: input.id,
    orgId: input.orgId,
    groupId: input.groupId,
    state: "ready",
    attemptCount: 0,
    idempotencyKey: input.idempotencyKey,
    providerPostId: null,
    submittedAt: null,
    reconciledAt: null,
    terminal: false,
    lastCallbackId: null,
    lastCallbackOutcome: null,
  };
}

/**
 * Request submission of a target to the provider.
 *   • ready | pending_retry → issue exactly one provider submit, count attempt.
 *   • submitted | awaiting_reconciliation → NO re-post (returns the existing
 *     target as a no-op; models the (org, idempotency_key) unique conflict).
 *   • terminal → no-op.
 * Blocked by emergency stop; rejects cross-org.
 */
export function submit(
  t: Target,
  ctx: BaseCtx & { emergencyActive: boolean },
): Decision {
  const cross = crossOrgGuard(t, ctx);
  if (cross) return cross;

  if (ctx.emergencyActive) {
    return {
      ok: false,
      noop: false,
      error: "emergency_stop_active",
      target: clone(t),
      events: [ev(t, t.state, t.state, "emergency_blocked", ctx, { reason: "submit blocked by emergency stop" })],
      providerSubmitRequested: false,
    };
  }

  // Already in flight or awaiting reconciliation → never a second post.
  if (t.state === "submitted" || t.state === "awaiting_reconciliation") {
    return { ok: true, noop: true, error: null, target: clone(t), events: [], providerSubmitRequested: false };
  }
  // Terminal → nothing to do.
  if (TERMINAL_STATES.includes(t.state)) {
    return { ok: true, noop: true, error: null, target: clone(t), events: [], providerSubmitRequested: false };
  }
  if (t.state === "needs_review") {
    return {
      ok: false,
      noop: false,
      error: "needs_review_first",
      target: clone(t),
      events: [],
      providerSubmitRequested: false,
    };
  }

  // ready | pending_retry → issue the (only) provider submit for this attempt.
  const from = t.state;
  const next = clone(t);
  next.state = "submitted";
  next.attemptCount = t.attemptCount + 1;
  next.submittedAt = ctx.now;
  const kind: EventKind = from === "pending_retry" ? "retry_submit" : "submit";
  return {
    ok: true,
    noop: false,
    error: null,
    target: next,
    events: [ev(next, from, "submitted", kind, ctx, { reason: `attempt ${next.attemptCount}` })],
    providerSubmitRequested: true,
  };
}

/**
 * The acknowledgement for a submitted target was lost. Move it to
 * `awaiting_reconciliation`. NEVER re-posts. Stale calls (not `submitted`) are
 * no-ops so a late/duplicate lost-ack signal cannot corrupt a resolved target.
 */
export function markAckLost(t: Target, ctx: BaseCtx): Decision {
  const cross = crossOrgGuard(t, ctx);
  if (cross) return cross;

  if (t.state !== "submitted") {
    return { ok: true, noop: true, error: null, target: clone(t), events: [], providerSubmitRequested: false };
  }
  const next = clone(t);
  next.state = "awaiting_reconciliation";
  return {
    ok: true,
    noop: false,
    error: null,
    target: next,
    events: [ev(next, "submitted", "awaiting_reconciliation", "ack_lost", ctx, { reason: "extension ack not received" })],
    providerSubmitRequested: false,
  };
}

/**
 * Idempotent extension-result callback.
 *   • Duplicate (same callbackId, same outcome) → no-op, no events.
 *   • Conflicting (same callbackId, different outcome) → needs_review.
 *   • published → terminal published (never re-posts).
 *   • not_published → pending_retry (eligible for a NEW attempt; not automatic).
 *   • failed_permanent → terminal, no retry.
 *   • failed_transient → pending_retry on the SAME target.
 *   • A contradicting outcome against an already-published target → needs_review.
 */
export function recordCallback(
  t: Target,
  ctx: BaseCtx & { callbackId: string; outcome: CallbackOutcome },
): Decision {
  const cross = crossOrgGuard(t, ctx);
  if (cross) return cross;

  // ── Idempotency on the callback identity ────────────────────────────────
  if (t.lastCallbackId === ctx.callbackId) {
    if (t.lastCallbackOutcome === ctx.outcome) {
      // Exact duplicate delivery → no-op (no duplicate audit/state events).
      return { ok: true, noop: true, error: null, target: clone(t), events: [], providerSubmitRequested: false };
    }
    // Same delivery id, contradicting outcome → conflict.
    if (t.state === "needs_review") {
      return { ok: true, noop: true, error: null, target: clone(t), events: [], providerSubmitRequested: false };
    }
    const next = clone(t);
    const from = t.state;
    next.state = "needs_review";
    return {
      ok: true,
      noop: false,
      error: null,
      target: next,
      events: [ev(next, from, "needs_review", "callback_conflict", ctx, { callbackId: ctx.callbackId, reason: `conflicting outcome ${t.lastCallbackOutcome} → ${ctx.outcome}` })],
      providerSubmitRequested: false,
    };
  }

  // ── Already published: a fresh callback is either a benign confirm or a
  //    contradiction that needs a human ───────────────────────────────────
  if (t.state === "published") {
    if (ctx.outcome === "published") {
      const next = clone(t);
      next.lastCallbackId = ctx.callbackId;
      next.lastCallbackOutcome = ctx.outcome;
      return { ok: true, noop: true, error: null, target: next, events: [], providerSubmitRequested: false };
    }
    const next = clone(t);
    next.lastCallbackId = ctx.callbackId;
    next.lastCallbackOutcome = ctx.outcome;
    next.state = "needs_review";
    return {
      ok: true,
      noop: false,
      error: null,
      target: next,
      events: [ev(next, "published", "needs_review", "callback_conflict", ctx, { callbackId: ctx.callbackId, reason: `post-publish contradiction: ${ctx.outcome}` })],
      providerSubmitRequested: false,
    };
  }
  if (t.state === "failed_permanent" || t.state === "cancelled") {
    // Terminal-failed target: record the callback id but do not resurrect.
    const next = clone(t);
    next.lastCallbackId = ctx.callbackId;
    next.lastCallbackOutcome = ctx.outcome;
    return { ok: true, noop: true, error: null, target: next, events: [], providerSubmitRequested: false };
  }

  const from = t.state;
  const next = clone(t);
  next.lastCallbackId = ctx.callbackId;
  next.lastCallbackOutcome = ctx.outcome;

  switch (ctx.outcome) {
    case "published": {
      next.state = "published";
      next.terminal = true;
      next.reconciledAt = ctx.now;
      return {
        ok: true,
        noop: false,
        error: null,
        target: next,
        events: [ev(next, from, "published", "confirmed_published", ctx, { callbackId: ctx.callbackId })],
        providerSubmitRequested: false,
      };
    }
    case "not_published": {
      next.state = "pending_retry";
      next.reconciledAt = ctx.now;
      return {
        ok: true,
        noop: false,
        error: null,
        target: next,
        events: [ev(next, from, "pending_retry", "confirmed_not_published", ctx, { callbackId: ctx.callbackId, reason: "reconciled: nothing posted" })],
        providerSubmitRequested: false,
      };
    }
    case "failed_permanent": {
      next.state = "failed_permanent";
      next.terminal = true;
      return {
        ok: true,
        noop: false,
        error: null,
        target: next,
        events: [ev(next, from, "failed_permanent", "failed_permanent", ctx, { callbackId: ctx.callbackId })],
        providerSubmitRequested: false,
      };
    }
    case "failed_transient":
    default: {
      next.state = "pending_retry";
      return {
        ok: true,
        noop: false,
        error: null,
        target: next,
        events: [ev(next, from, "pending_retry", "transient_failure", ctx, { callbackId: ctx.callbackId, reason: "retryable failure" })],
        providerSubmitRequested: false,
      };
    }
  }
}

/**
 * Authorized manager makes an audited manual decision on an uncertain target.
 * Only a manager may decide; the actor is stamped on the event.
 */
export function managerDecision(
  t: Target,
  ctx: BaseCtx & { decision: ManagerDecision; isManager: boolean },
): Decision {
  const cross = crossOrgGuard(t, ctx);
  if (cross) return cross;

  if (!ctx.isManager) {
    return { ok: false, noop: false, error: "not_authorized", target: clone(t), events: [], providerSubmitRequested: false };
  }
  if (t.state !== "awaiting_reconciliation" && t.state !== "needs_review") {
    return { ok: false, noop: false, error: "not_reconcilable", target: clone(t), events: [], providerSubmitRequested: false };
  }
  const from = t.state;
  const next = clone(t);
  next.reconciledAt = ctx.now;
  if (ctx.decision === "published") {
    next.state = "published";
    next.terminal = true;
    return {
      ok: true,
      noop: false,
      error: null,
      target: next,
      events: [ev(next, from, "published", "manual_confirmed_published", ctx, { reason: "manager confirmed live" })],
      providerSubmitRequested: false,
    };
  }
  next.state = "pending_retry";
  return {
    ok: true,
    noop: false,
    error: null,
    target: next,
    events: [ev(next, from, "pending_retry", "manual_allow_retry", ctx, { reason: "manager authorized retry" })],
    providerSubmitRequested: false,
  };
}

/**
 * Attempt a retry. Allowed ONLY from `pending_retry` (i.e. reconciliation or an
 * authorized manager cleared it). Blocked while `awaiting_reconciliation`;
 * refused after permanent failure; no-op once published. Always the SAME target.
 */
export function retry(
  t: Target,
  ctx: BaseCtx & { emergencyActive: boolean },
): Decision {
  const cross = crossOrgGuard(t, ctx);
  if (cross) return cross;

  if (ctx.emergencyActive) {
    return {
      ok: false,
      noop: false,
      error: "emergency_stop_active",
      target: clone(t),
      events: [ev(t, t.state, t.state, "emergency_blocked", ctx, { reason: "retry blocked by emergency stop" })],
      providerSubmitRequested: false,
    };
  }
  if (t.state === "awaiting_reconciliation") {
    return {
      ok: false,
      noop: false,
      error: "retry_blocked_awaiting_reconciliation",
      target: clone(t),
      events: [ev(t, t.state, t.state, "retry_blocked", ctx, { reason: "must reconcile before retry" })],
      providerSubmitRequested: false,
    };
  }
  if (t.state === "published") {
    return { ok: true, noop: true, error: null, target: clone(t), events: [], providerSubmitRequested: false };
  }
  if (t.state === "failed_permanent") {
    return { ok: false, noop: false, error: "no_retry_permanent", target: clone(t), events: [], providerSubmitRequested: false };
  }
  if (t.state === "needs_review") {
    return { ok: false, noop: false, error: "needs_review_first", target: clone(t), events: [], providerSubmitRequested: false };
  }
  if (t.state !== "pending_retry") {
    return { ok: false, noop: false, error: "not_retryable", target: clone(t), events: [], providerSubmitRequested: false };
  }
  // pending_retry → new submit on the SAME target id.
  return submit(t, ctx);
}
