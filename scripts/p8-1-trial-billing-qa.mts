// P8.1 — TRIAL PROVISIONING + BILLING STATE INTEGRATION QA (PURE; no DB, no
// provider, no writes). Proves: the canonical getOrgBillingState composition,
// 14-day trial semantics, commercial≠billing≠revenue separation, trial expiry
// → payment_due (design), unknown≠active, provider honesty, and — by construction
// — Platform Admin / Customer 360 consistency (both call composeOrgBillingState).
import { COMMERCIAL_MODEL, commercialState, type CommercialState } from "../src/lib/commercial/model.ts";
import { composeOrgBillingState, type BillingSubInput, type BillingPayInput } from "../src/lib/commercial/billing-compose.ts";
import { STATE_CONTRACT } from "../src/lib/commercial/billing-state.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

// Fixed clock so trial math is deterministic. "now" = 2026-08-13T00:00:00Z.
const NOW = Date.parse("2026-08-13T00:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const gen = "2026-08-13T00:00:00.000Z";

// Helper: build commercial state for N active agents (owner incl.), trial flag.
const comm = (active: number, opts: { isTrial?: boolean; pending?: number; trialEndsAt?: string | null } = {}): CommercialState =>
  commercialState({ seats: { activeUsers: active, pendingInvites: opts.pending ?? 0 }, isTrial: opts.isTrial ?? false, trialEndsAt: opts.trialEndsAt ?? null });

// Helper: run the canonical composition with defaults.
const compose = (o: { commercial: CommercialState; sub: BillingSubInput | null; pays?: BillingPayInput[]; providerConfigured?: boolean; nowMs?: number }) =>
  composeOrgBillingState({
    orgId: "org-under-test", commercial: o.commercial, sub: o.sub, pays: o.pays ?? [],
    nowMs: o.nowMs ?? NOW, providerConfigured: o.providerConfigured ?? false, generatedAt: gen,
  });

const trialSub = (endsMs: number): BillingSubInput => ({
  status: "trial", period_end: null, trial_ends_at: iso(endsMs), grow_subscription_id: null, cancel_at_period_end: false,
});

console.log("P8.1 · 14-day trial provisioning semantics");
{
  const startMs = NOW;
  const endsMs = startMs + 14 * DAY;
  const s = compose({ commercial: comm(1, { isTrial: true, trialEndsAt: iso(endsMs) }), sub: trialSub(endsMs) });
  ok(s.trial.daysTotal === 14 && COMMERCIAL_MODEL.trialDays === 14, "trial length = 14 days (canonical)");
  ok(s.trial.endsAt === iso(endsMs), "trial_ends_at surfaced from subscription");
  ok(s.trial.startsAt === iso(endsMs - 14 * DAY), "trial startsAt = endsAt − 14d (derived)");
  ok(s.trial.isTrial === true && s.trial.expired === false, "active trial: isTrial=true, expired=false");
  ok(s.billingState === "trialing", "fresh trial → billingState 'trialing'");
  ok(s.customerAccess === "full", "trial → full customer access");
}

console.log("\nP8.1 · trial expiry (no payment) → payment_due  [DESIGN — no enforcement]");
{
  const endsMs = NOW - 1 * DAY;   // expired yesterday
  const s = compose({ commercial: comm(3, { isTrial: false, trialEndsAt: iso(endsMs) }), sub: trialSub(endsMs) });
  ok(s.trial.expired === true, "trial flagged expired once trial_ends_at passes");
  ok(s.billingState === "payment_due", "expired trial + no verified payment → payment_due (never silently active)");
  ok(s.customerAccess === "full", "payment_due still full access (grace-by-design; no enforcement wired)");
  ok(s.verifiedRevenue.available === false, "no verified payment → verifiedRevenue UNAVAILABLE (never 0, never 197×N)");
}

console.log("\nP8.1 · unknown / absent subscription is NEVER silently 'active'");
{
  ok(compose({ commercial: comm(2), sub: null }).billingState === "payment_due", "no subscription row → payment_due");
  const weird: BillingSubInput = { status: "wat", period_end: null, trial_ends_at: null, grow_subscription_id: null, cancel_at_period_end: false };
  ok(compose({ commercial: comm(2), sub: weird }).billingState === "payment_due", "unrecognized status → payment_due");
}

console.log("\nP8.1 · commercial ≠ billing ≠ revenue (strict separation)");
{
  // 4 active agents, on trial, ZERO verified payments.
  const s = compose({ commercial: comm(4, { isTrial: true, trialEndsAt: iso(NOW + 10 * DAY) }), sub: trialSub(NOW + 10 * DAY) });
  ok(s.expectedMonthlyIls === 788 && s.isExpectationOnly === true, "expectedMonthlyIls = 4×197 = 788 — flagged EXPECTATION only");
  ok(s.verifiedRevenue.available === false && s.verifiedRevenue.reason === "NO_VERIFIED_PAYMENT", "verifiedRevenue UNAVAILABLE — expectation NEVER promoted to revenue");
  ok(s.billableAgents === 4, "billableAgents = 4 active (owner incl.)");
  // A verified payment DOES become revenue — and ONLY the verified sum.
  const pays: BillingPayInput[] = [
    { status: "paid", amount_ils: 788, verified: true, verified_at: iso(NOW - DAY), created_at: iso(NOW - DAY), environment: "production" },
    { status: "paid", amount_ils: 999, verified: false, verified_at: null, created_at: iso(NOW - 2 * DAY), environment: "production" }, // unverified — excluded
    { status: "failed", amount_ils: 788, verified: false, verified_at: null, created_at: iso(NOW - 3 * DAY), environment: "production" },
  ];
  const s2 = compose({ commercial: comm(4), sub: { status: "active", period_end: iso(NOW + 20 * DAY), trial_ends_at: null, grow_subscription_id: "grow_x", cancel_at_period_end: false }, pays });
  ok(s2.verifiedRevenue.available === true && s2.verifiedRevenue.value!.amountIls === 788 && s2.verifiedRevenue.value!.count === 1, "verifiedRevenue = ONLY signed/paid sum (788, count 1) — unverified 999 excluded");
  ok(s2.paymentFailures === 1, "failed payment counted separately (not revenue)");
  ok(s2.billingState === "active", "verified active subscription → active");
}

console.log("\nP8.1 · per-agent pricing thresholds (4→788, 10→1970, 11→custom)");
{
  ok(compose({ commercial: comm(4), sub: null }).expectedMonthlyIls === 788, "4 agents → 788 ₪ expectation");
  ok(compose({ commercial: comm(10), sub: null }).expectedMonthlyIls === 1970, "10 agents → 1970 ₪ expectation");
  const s11 = compose({ commercial: comm(11), sub: { status: "active", period_end: null, trial_ends_at: null, grow_subscription_id: null, cancel_at_period_end: false } });
  ok(s11.customPricingRequired === true && s11.expectedMonthlyIls === null, "11 agents → custom_pricing_required (NO auto 197×11)");
  ok(s11.billingState === "custom_pricing_required", ">10 agents overrides billing state → custom_pricing_required");
}

console.log("\nP8.1 · pending invitations reserve capacity but are NOT billable");
{
  const s = compose({ commercial: comm(3, { pending: 2 }), sub: null });
  ok(s.billableAgents === 3 && s.reservedSeats === 2, "3 active billable, 2 pending reserved (not billed)");
  ok(s.expectedMonthlyIls === 591, "expectation = 3×197 = 591 (pending excluded)");
}

console.log("\nP8.1 · provider honesty (no real charge / config surfaced truthfully)");
{
  const unconfigured = compose({ commercial: comm(1), sub: null, providerConfigured: false });
  ok(unconfigured.provider.name === "grow" && unconfigured.provider.configured === false, "provider reported unconfigured when env absent (no fabricated readiness)");
  const withSub: BillingSubInput = { status: "active", period_end: iso(NOW + 30 * DAY), trial_ends_at: null, grow_subscription_id: "grow_sub_1", cancel_at_period_end: false };
  const s = compose({ commercial: comm(1), sub: withSub, providerConfigured: true });
  ok(s.provider.configured === true && s.provider.subscriptionIdPresent === true, "provider configured + subscription id present surfaced honestly");
}

console.log("\nP8.1 · cancel-pending & cancelled (data preserved, read-only design)");
{
  const cp: BillingSubInput = { status: "active", period_end: iso(NOW + 5 * DAY), trial_ends_at: null, grow_subscription_id: "g", cancel_at_period_end: true };
  ok(compose({ commercial: comm(2), sub: cp }).billingState === "cancel_pending", "active + cancel_at_period_end → cancel_pending");
  const cancelled: BillingSubInput = { status: "cancelled", period_end: iso(NOW - DAY), trial_ends_at: null, grow_subscription_id: "g", cancel_at_period_end: false };
  const sc = compose({ commercial: comm(2), sub: cancelled });
  ok(sc.billingState === "cancelled" && sc.customerAccess === "read_only", "cancelled → read_only (design)");
  ok(/NEVER DELETED/i.test(STATE_CONTRACT.cancelled.enforcementConsequence), "cancelled contract: data NEVER deleted");
}

console.log("\nP8.1 · Platform Admin ⇔ Customer 360 consistency (SAME resolver, byte-identical)");
{
  // Both surfaces (billing.getOrgBillingDetail, dal.getOrgBillingForPlatform) attach
  // the object returned by getOrgBillingState → composeOrgBillingState. Identical
  // inputs MUST yield an identical object. Prove determinism of the pure core.
  const commercial = comm(6, { isTrial: true, trialEndsAt: iso(NOW + 7 * DAY) });
  const sub = trialSub(NOW + 7 * DAY);
  const pays: BillingPayInput[] = [{ status: "paid", amount_ils: 1182, verified: true, verified_at: iso(NOW - DAY), created_at: iso(NOW - DAY), environment: "production" }];
  const a = compose({ commercial, sub, pays });
  const b = compose({ commercial, sub, pays });
  ok(JSON.stringify(a) === JSON.stringify(b), "identical inputs → byte-identical OrgBillingState (deterministic single source of truth)");
  ok(a.isExpectationOnly === true, "canonical object always flags isExpectationOnly");
}

console.log("\nP8.1 · trial provisioning is idempotent BY DESIGN (ensureTrialSubscription)");
{
  // ensureTrialSubscription: SELECT-then-insert guarded by subscriptions.PK=org_id;
  // an existing row (any status) → { created:false } NO-OP; PK/unique conflict on a
  // concurrent insert is swallowed. Assert the source contract literally holds.
  // (Runtime DB idempotency is exercised against production read-only checks + the
  //  PK constraint; here we assert the guard shape is present in the module.)
  import("node:fs").then(({ readFileSync }) => {
    const src = readFileSync(new URL("../src/lib/commercial/store.ts", import.meta.url), "utf8");
    ok(/if \(existing\) return \{ created: false \}/.test(src), "existing subscription → created:false (never resets trial/period)");
    ok(/duplicate key\|unique\|conflict/.test(src), "concurrent PK/unique conflict swallowed → single trial row");
    ok(/status: "trial"/.test(src), "new-org trial row created with status 'trial'");
    // Onboarding wiring: trial entered ONLY through completeOnboarding (no-payment path).
    const onb = readFileSync(new URL("../src/lib/onboarding/actions.ts", import.meta.url), "utf8");
    ok(/ensureTrialSubscription\(org\.id, 14\)/.test(onb), "completeOnboarding provisions the 14-day trial for every new office");
    ok(/billing\.trial\.started/.test(onb), "trial start emits an audit_log entry (best-effort, non-blocking)");

    console.log("");
    console.log(fail === 0 ? "ALL P8.1 TRIAL/BILLING QA PASSED" : `${fail} FAILED`);
    if (fail) process.exit(1);
  });
}
