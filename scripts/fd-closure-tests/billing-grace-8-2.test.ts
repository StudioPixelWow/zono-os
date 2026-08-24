// ============================================================================
// ZONO BILLING 8.2 — GRACE POLICY + BILLING_RESTRICTED regression tests.
// Proves the FINAL product decision (7-day grace → automatic billing restriction,
// never data loss) at the pure-logic layer, and verifies the smallest canonical
// automatic path is actually WIRED (source-closure) since the DB/provider round-
// trip cannot run without credentials. Never fabricates a provider success.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/billing-grace-8-2.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { graceEndsAtFrom, GRACE_PERIOD_DAYS } from "../../src/lib/commercial/lifecycle.ts";
import {
  billingAccessForState, mutationAllowedForAccess, canonicalFromSubscriptionStatus,
} from "../../src/lib/commercial/billing-state.ts";

const DAY = 86_400_000;
const T0 = Date.parse("2026-08-24T00:00:00Z");
const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");

// ── GRACE WINDOW = 7 DAYS ─────────────────────────────────────────────────────
test("grace window is exactly 7 days", () => {
  assert.equal(GRACE_PERIOD_DAYS, 7);
  const until = graceEndsAtFrom(T0);
  assert.equal(Date.parse(until) - T0, 7 * DAY);
});

// ── CANONICAL ACCESS DECISION (the ONE gate's pure core) ──────────────────────
test("grace state keeps FULL access (7-day window, clock running)", () => {
  assert.equal(billingAccessForState("grace"), "full");
  assert.equal(mutationAllowedForAccess("full"), true);
});
test("post-grace payment_failed → RESTRICTED (premium mutations blocked)", () => {
  assert.equal(billingAccessForState("payment_failed"), "restricted");
  assert.equal(mutationAllowedForAccess("restricted"), false);
});
test("cancelled → read_only (view kept, mutations blocked)", () => {
  assert.equal(billingAccessForState("cancelled"), "read_only");
  assert.equal(mutationAllowedForAccess("read_only"), false);
});
test("active & trialing → full access", () => {
  assert.equal(billingAccessForState("active"), "full");
  assert.equal(billingAccessForState("trialing"), "full");
});
test("only 'full' permits premium mutations", () => {
  assert.equal(mutationAllowedForAccess("full"), true);
  assert.equal(mutationAllowedForAccess("read_only"), false);
  assert.equal(mutationAllowedForAccess("restricted"), false);
});

// ── LEGACY STATUS MAPPING (grace_period ↔ grace, suspended ↔ payment_failed) ──
test("legacy grace_period → canonical grace; suspended → payment_failed", () => {
  assert.equal(canonicalFromSubscriptionStatus("grace_period", { customPricing: false, cancelAtPeriodEnd: false }), "grace");
  assert.equal(canonicalFromSubscriptionStatus("suspended", { customPricing: false, cancelAtPeriodEnd: false }), "payment_failed");
});

// ── WIRING (source-closure): the smallest canonical automatic path exists ─────
test("failed payment starts grace — webhook wires beginGraceWindow", () => {
  const s = src("app/api/payments/grow/webhook/route.ts");
  assert.match(s, /beginGraceWindow/, "webhook must begin the grace window on authoritative failure");
});
test("grace expiry → restriction — cron wires restrictAfterGraceWindow", () => {
  const s = src("app/api/cron/billing-boundary/route.ts");
  assert.match(s, /restrictAfterGraceWindow/, "boundary cron must flip expired grace to restricted");
});
test("restriction writer flips grace_period → suspended only after grace_until, idempotently", () => {
  const s = src("lib/commercial/lifecycle-server.ts");
  assert.match(s, /restrictAfterGraceWindow/);
  assert.match(s, /status:\s*"suspended"/);
  assert.match(s, /\.eq\("status",\s*"grace_period"\)/, "conditional on grace_period (idempotent no-op otherwise)");
  assert.match(s, /grace_until/, "gated on grace_until expiry");
});
test("recovery clears grace_until on verified activation (no lingering restriction)", () => {
  const s = src("lib/commercial/activate.ts");
  assert.match(s, /grace_until:\s*null/, "activation must clear grace_until");
});
test("restricted org cannot add a paid seat — invite/activate actions call the canonical guard", () => {
  const s = src("lib/team-admin/actions.ts");
  assert.match(s, /assertBillingAllowsMutation|guardSeatMutation/, "seat mutations must pass the billing gate");
});
test("data is never deleted on billing failure — restriction is a status-only transition", () => {
  const s = src("lib/commercial/lifecycle-server.ts");
  assert.doesNotMatch(s, /\.delete\(\)/, "lifecycle server must never delete rows");
});
test("canonical entitlement gate exists and is server-only", () => {
  const s = src("lib/commercial/billing-access.ts");
  assert.match(s, /server-only/);
  assert.match(s, /resolveBillingAccess/);
  assert.match(s, /assertBillingAllowsMutation/);
});
test("billing notifications use a VALID canonical category ('system')", () => {
  const s = src("lib/commercial/billing-notify.ts");
  assert.match(s, /category:\s*"system"/, "must use a canonical notification_category enum value");
});
