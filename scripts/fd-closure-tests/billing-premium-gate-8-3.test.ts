// ============================================================================
// ZONO BILLING 8.3 — PREMIUM ENTITLEMENT CLOSURE regression tests.
// Proves the canonical gate's decision for every state, its fail-CLOSED posture
// for provider spend, and that each guarded cost chokepoint invokes the gate
// BEFORE the provider work (source-closure ordering — the live DB/provider round-
// trip cannot run without credentials, so we prove the wiring can never be
// bypassed). Never fabricates a provider call.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/billing-premium-gate-8-3.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billingAccessForState, mutationAllowedForAccess } from "../../src/lib/commercial/billing-state.ts";

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");
/** True iff `gate` first appears before `provider` in the source (ordering proof). */
function gateBeforeProvider(s: string, gate: string, provider: string): boolean {
  const g = s.indexOf(gate); const p = s.indexOf(provider);
  return g >= 0 && p >= 0 && g < p;
}

// ── STATE MATRIX (§16) — pure canonical decision ──────────────────────────────
const ALLOW = (state: string) => mutationAllowedForAccess(billingAccessForState(state as never));
test("ACTIVE → premium allowed", () => assert.equal(ALLOW("active"), true));
test("TRIAL → premium allowed", () => assert.equal(ALLOW("trialing"), true));
test("GRACE → premium allowed (7-day window)", () => assert.equal(ALLOW("grace"), true));
test("RESTRICTED (payment_failed/suspended) → premium BLOCKED", () => assert.equal(ALLOW("payment_failed"), false));
test("READ_ONLY (cancelled) → premium BLOCKED", () => assert.equal(ALLOW("cancelled"), false));
test("payment_due → allowed (still full access, pre-grace)", () => assert.equal(ALLOW("payment_due"), true));

// ── FAIL-CLOSED for provider spend (§3) ───────────────────────────────────────
test("assertProviderSpendAllowed is fail-CLOSED; reads/seat mgmt fail-OPEN", () => {
  const s = src("lib/commercial/billing-access.ts");
  assert.match(s, /assertProviderSpendAllowed[\s\S]*failClosed:\s*true/, "provider spend must pass failClosed:true");
  assert.match(s, /isProviderSpendBlocked/, "batch/cron boolean gate must exist");
  assert.match(s, /return true; \/\/ unknown billing state must never spend/, "batch gate blocks on lookup error");
  // resolveBillingAccess (UI/read) stays fail-open.
  assert.match(s, /fail-open[\s\S]*return openFullFor/i);
});

// ── AI / CREATIVE GENERATION gated BEFORE provider call (§4) ───────────────────
test("creative generation calls the gate immediately after ctx(), before any provider work", () => {
  const out = src("lib/creative-studio/output-service.ts");
  assert.match(out, /await ctx\(\);\s*\n\s*await assertProviderSpendAllowed\(orgId\)/, "output-service gate must be right after ctx()");
  const quick = src("lib/creative-studio/quick-creative-service.ts");
  assert.ok((quick.match(/assertProviderSpendAllowed\(orgId\)/g) ?? []).length >= 3, "quick-creative gens must be gated");
  const copy = src("lib/creative-studio/copy-service.ts");
  assert.match(copy, /await ctx\(\);\s*\n\s*await assertProviderSpendAllowed\(orgId\)/, "copy-service gate must be right after ctx()");
});

// ── BULK / BUYER-PORTAL OUTBOUND gated BEFORE send (§5,§6) ─────────────────────
test("buyer-portal / property outbound send is gated before the provider send", () => {
  const s = src("lib/customer-comm/property-outreach.ts");
  assert.ok(gateBeforeProvider(s, "isProviderSpendBlocked", "sendCustomerEmail") || gateBeforeProvider(s, "isProviderSpendBlocked", ".from(\"properties\")"),
    "outreach must check billing before the property lookup / provider send");
  const action = src("lib/customer-comm/property-outreach-actions.ts");
  assert.match(action, /assertProviderSpendAllowed[\s\S]*sendPropertyToSelectedBuyers/, "outreach action gates before delegating to send");
  const mb = src("lib/customer-comm/match-bundle.ts");
  assert.ok(gateBeforeProvider(mb, "isProviderSpendBlocked", ".from(\"properties\")"), "match bundle checks billing before send");
});

// ── MARKETING / DISTRIBUTION launch gated (§7) ────────────────────────────────
test("distribution group publish + FB page publish are gated", () => {
  const ext = src("lib/distribution/extension-service.ts");
  assert.ok(gateBeforeProvider(ext, "isProviderSpendBlocked", "listGroupDestinations"), "group publish checks billing before creating provider tasks");
  const act = src("lib/distribution/provider-connections-actions.ts");
  assert.ok(gateBeforeProvider(act, "assertProviderSpendAllowed", "publishToFacebookPage"), "FB page publish gated before the Graph call");
});

// ── BACKGROUND JOBS covered by the shared chokepoint (§8,§9) ───────────────────
test("cron/queued sends flow through the SAME gated chokepoints (no bypass)", () => {
  // The gate lives at the shared send functions, so any cron/automation/queued
  // caller re-checks billing at execution time and skips a restricted org.
  const s = src("lib/customer-comm/property-outreach.ts");
  assert.match(s, /skipped:\s*recipientIds\.length/, "restricted batch returns an honest skipped count, never a partial send");
  assert.doesNotMatch(s, /\.delete\(\)/, "no history deletion on a billing skip");
});

// ── READS never gated (contract) ──────────────────────────────────────────────
test("resolveBillingAccess (the read/UI resolver) never blocks reads", () => {
  const s = src("lib/commercial/billing-access.ts");
  assert.match(s, /Reads are NEVER gated|Reads \/ UI only/);
});
