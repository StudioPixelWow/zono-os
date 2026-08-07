// ============================================================================
// ZONO — Lost-ack / reconciliation core: 13-scenario runtime proof.
// Mocks/dry-run ONLY. No Facebook, no network, no DB. A counting "provider"
// stands in for the real extension submit so we can PROVE at-most-once posting.
// Run: node --experimental-strip-types --test lost-ack-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareTarget,
  submit,
  markAckLost,
  recordCallback,
  managerDecision,
  retry,
  type Target,
  type Decision,
} from "../../src/lib/distribution/lost-ack-core.ts";

const ORG = "org-alpha";
const OTHER_ORG = "org-beta";
const GROUP = "group-1";

// A driver that mimics the caller: it applies a Decision to its target, appends
// the events to an append-only log, and — crucially — performs the (mock)
// provider submit EXACTLY when the core requests it, counting every real post.
class Driver {
  target: Target;
  events: Decision["events"] = [];
  providerSubmits = 0; // number of real "posts to Facebook" attempted
  private seq = 0;
  constructor(idem = "idem-1", org = ORG) {
    this.target = prepareTarget({ id: "t-1", orgId: org, groupId: GROUP, idempotencyKey: idem });
  }
  private ctx(extra: Record<string, unknown> = {}) {
    this.seq += 1;
    return { callerOrgId: ORG, now: `2026-08-06T00:00:0${this.seq}Z`, eventId: `e-${this.seq}`, ...extra };
  }
  private apply(d: Decision): Decision {
    if (d.ok || d.events.length) this.events.push(...d.events);
    if (!d.error || d.ok) this.target = d.target;
    if (d.providerSubmitRequested) this.providerSubmits += 1; // the ONLY place a post happens
    return d;
  }
  submit(emergencyActive = false) {
    return this.apply(submit(this.target, this.ctx({ emergencyActive })));
  }
  ackLost() {
    return this.apply(markAckLost(this.target, this.ctx()));
  }
  callback(callbackId: string, outcome: string) {
    return this.apply(recordCallback(this.target, this.ctx({ callbackId, outcome })));
  }
  manager(decision: string, isManager = true, actorId = "mgr-1") {
    return this.apply(managerDecision(this.target, this.ctx({ decision, isManager, actorId })));
  }
  retry(emergencyActive = false) {
    return this.apply(retry(this.target, this.ctx({ emergencyActive })));
  }
  stateEvents(kind: string) {
    return this.events.filter((e) => e.kind === kind);
  }
}

// ── 1. Submitted → lost ack → awaiting_reconciliation; no immediate re-post ──
test("S1 lost ack parks target in awaiting_reconciliation with no re-post", () => {
  const d = new Driver();
  d.submit();
  assert.equal(d.target.state, "submitted");
  assert.equal(d.providerSubmits, 1);
  d.ackLost();
  assert.equal(d.target.state, "awaiting_reconciliation");
  assert.equal(d.providerSubmits, 1, "no second post on lost ack");
  assert.equal(d.stateEvents("ack_lost").length, 1);
});

// ── 2. Retry blocked until reconciliation ────────────────────────────────────
test("S2 retry is blocked while awaiting_reconciliation", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  const r = d.retry();
  assert.equal(r.ok, false);
  assert.equal(r.error, "retry_blocked_awaiting_reconciliation");
  assert.equal(d.providerSubmits, 1, "blocked retry never posts");
  assert.equal(d.target.state, "awaiting_reconciliation");
});

// ── 3. Reconciliation confirms PUBLISHED → published, at-most-once total ─────
test("S3 lost-ack target confirmed published posts AT MOST ONCE", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  d.callback("cb-1", "published"); // truth: it WAS posted
  assert.equal(d.target.state, "published");
  assert.equal(d.target.terminal, true);
  assert.equal(d.providerSubmits, 1, "the whole point: exactly one real post");
  assert.equal(d.stateEvents("confirmed_published").length, 1);
});

// ── 4. Reconciliation confirms NOT published → eligible for a new attempt ────
test("S4 confirmed-not-published enables one new attempt on the same target", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  d.callback("cb-1", "not_published");
  assert.equal(d.target.state, "pending_retry");
  assert.equal(d.providerSubmits, 1, "reconciliation itself never posts");
  const before = d.target.id;
  d.retry();
  assert.equal(d.target.id, before, "same target, never a new one");
  assert.equal(d.target.state, "submitted");
  assert.equal(d.target.attemptCount, 2);
  assert.equal(d.providerSubmits, 2);
});

// ── 5. Authorized manager manual decision: published (audited) ───────────────
test("S5 manager manual 'published' is audited and terminal, no post", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  const r = d.manager("published", true, "mgr-7");
  assert.equal(r.ok, true);
  assert.equal(d.target.state, "published");
  assert.equal(d.providerSubmits, 1);
  const e = d.stateEvents("manual_confirmed_published");
  assert.equal(e.length, 1);
  assert.equal(e[0].actorId, "mgr-7", "actor recorded for audit");
});

// ── 6. Authorized manager manual decision: allow retry (audited) ─────────────
test("S6 manager manual 'allow_retry' authorizes exactly one further attempt", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  d.manager("allow_retry", true, "mgr-7");
  assert.equal(d.target.state, "pending_retry");
  assert.equal(d.stateEvents("manual_allow_retry").length, 1);
  d.retry();
  assert.equal(d.providerSubmits, 2);
  assert.equal(d.target.attemptCount, 2);
});
test("S6b non-manager cannot make a manual decision", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  const r = d.manager("published", false, "agent-3");
  assert.equal(r.ok, false);
  assert.equal(r.error, "not_authorized");
  assert.equal(d.target.state, "awaiting_reconciliation");
});

// ── 7. Idempotent callback: duplicate = no-op, no duplicate events ───────────
test("S7 duplicate callback is a no-op with no duplicate audit/state events", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  d.callback("cb-1", "published");
  const eventsAfterFirst = d.events.length;
  const r = d.callback("cb-1", "published"); // exact duplicate delivery
  assert.equal(r.noop, true);
  assert.equal(d.events.length, eventsAfterFirst, "no new events on duplicate");
  assert.equal(d.stateEvents("confirmed_published").length, 1);
  assert.equal(d.providerSubmits, 1);
});

// ── 8. Conflicting callback (same id, different outcome) → needs_review ──────
test("S8 conflicting callback moves target to needs_review (no silent overwrite)", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  d.callback("cb-1", "published");
  const r = d.callback("cb-1", "not_published"); // same delivery id, contradicts
  assert.equal(r.ok, true);
  assert.equal(d.target.state, "needs_review");
  assert.equal(d.stateEvents("callback_conflict").length, 1);
  assert.equal(d.providerSubmits, 1);
});

// ── 9. Retry / confirm after confirmed success = no-op ───────────────────────
test("S9 retry and re-confirm after success are no-ops (no multi-post)", () => {
  const d = new Driver();
  d.submit();
  d.callback("cb-1", "published"); // confirmed live
  assert.equal(d.target.state, "published");
  const r1 = d.retry();
  assert.equal(r1.noop, true);
  const r2 = d.callback("cb-2", "published"); // different id, same truth
  assert.equal(r2.noop, true);
  assert.equal(d.target.state, "published");
  assert.equal(d.providerSubmits, 1);
});

// ── 10. Permanent failure = no retry ─────────────────────────────────────────
test("S10 permanent failure is terminal and refuses retry", () => {
  const d = new Driver();
  d.submit();
  d.callback("cb-1", "failed_permanent");
  assert.equal(d.target.state, "failed_permanent");
  const r = d.retry();
  assert.equal(r.ok, false);
  assert.equal(r.error, "no_retry_permanent");
  assert.equal(d.providerSubmits, 1);
});

// ── 11. Transient failure = new attempt on the SAME target ───────────────────
test("S11 transient failure retries the same target, never a new one", () => {
  const d = new Driver();
  d.submit();
  const originalId = d.target.id;
  d.callback("cb-1", "failed_transient");
  assert.equal(d.target.state, "pending_retry");
  assert.equal(d.providerSubmits, 1);
  d.retry();
  assert.equal(d.target.id, originalId, "same target id");
  assert.equal(d.target.attemptCount, 2);
  assert.equal(d.providerSubmits, 2);
});

// ── 12. Unique-conflict on submission = re-read/return existing, no duplicate ─
test("S12 re-submitting an in-flight target is a no-op (no duplicate target/post)", () => {
  const d = new Driver();
  d.submit();
  assert.equal(d.target.state, "submitted");
  const r = d.submit(); // duplicate submit request (unique idempotency conflict)
  assert.equal(r.noop, true);
  assert.equal(d.providerSubmits, 1, "no second post from duplicate submit");
  assert.equal(d.target.attemptCount, 1);
});

// ── 13a. Emergency stop respected ────────────────────────────────────────────
test("S13a emergency stop blocks submit and retry (no post)", () => {
  const d = new Driver();
  const r1 = d.submit(true);
  assert.equal(r1.ok, false);
  assert.equal(r1.error, "emergency_stop_active");
  assert.equal(d.providerSubmits, 0);
  assert.equal(d.stateEvents("emergency_blocked").length, 1);
  // move to a retryable state normally, then prove retry is blocked too
  d.submit(false);
  d.callback("cb-1", "not_published");
  const r2 = d.retry(true);
  assert.equal(r2.ok, false);
  assert.equal(r2.error, "emergency_stop_active");
  assert.equal(d.providerSubmits, 1, "emergency-blocked retry never posts");
});

// ── 13b. Cross-org IDs rejected ──────────────────────────────────────────────
test("S13b cross-org callback/submit is rejected with no side effects", () => {
  // target belongs to OTHER_ORG; caller ctx uses ORG
  const t = prepareTarget({ id: "t-x", orgId: OTHER_ORG, groupId: GROUP, idempotencyKey: "idem-x" });
  const ctx = { callerOrgId: ORG, now: "2026-08-06T00:00:00Z", eventId: "e-x", emergencyActive: false };
  const rSubmit = submit(t, ctx);
  assert.equal(rSubmit.ok, false);
  assert.equal(rSubmit.error, "cross_org_rejected");
  assert.equal(rSubmit.events.length, 0);
  assert.equal(rSubmit.providerSubmitRequested, false);
  const rCb = recordCallback(t, { callerOrgId: ORG, now: "x", eventId: "e-y", callbackId: "cb", outcome: "published" });
  assert.equal(rCb.ok, false);
  assert.equal(rCb.error, "cross_org_rejected");
  assert.equal(t.state, "ready", "target untouched");
});

// ── Extra invariant: the lost-ack "double post" trap never fires ─────────────
test("INV lost ack + blind retries can never exceed one post until reconciled", () => {
  const d = new Driver();
  d.submit();
  d.ackLost();
  for (let i = 0; i < 5; i++) d.retry(); // hammer retry while awaiting
  assert.equal(d.providerSubmits, 1, "5 blind retries, still one post");
  assert.equal(d.target.state, "awaiting_reconciliation");
});
