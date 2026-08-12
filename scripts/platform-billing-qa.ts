/*
 * P5.5 — Billing state / plan-compat / provider QA (LOCAL, no DB, no network).
 * Proves the canonical billing resolver is deterministic, never fabricates
 * revenue, never infers "overdue" from missing rows, reconciles plan-vocab
 * conflicts without overwriting, and classifies Grow honestly.
 * Run: npx tsx scripts/platform-billing-qa.ts
 */
import {
  resolveBillingState, resolvePlanCompat, classifyGrow,
  type SubscriptionInput, type PaymentInput,
} from "../src/lib/platform-admin/billing/model";
import type { SubscriptionStatus } from "../src/lib/commercial/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function sub(status: SubscriptionStatus, over: Partial<SubscriptionInput> = {}): SubscriptionInput {
  return { status, planTier: "professional", periodStart: null, periodEnd: null, trialEndsAt: null, graceUntil: null, cancelAtPeriodEnd: false, growSubscriptionId: null, ...over };
}
function pay(status: PaymentInput["status"], verified = false): PaymentInput {
  return { status, verified, amountIls: 199, currency: "ILS", provider: "grow", createdAt: "2026-01-01T00:00:00Z" };
}

function main(): void {
  console.log("P5.5 billing resolver QA\n");

  // ── 1. Subscription status → billing state (deterministic, explainable). ──
  assert(resolveBillingState(sub("active"), null).state === "HEALTHY", "active → HEALTHY");
  assert(resolveBillingState(sub("active", { cancelAtPeriodEnd: true }), null).state === "CANCEL_PENDING", "active + cancelAtPeriodEnd → CANCEL_PENDING");
  assert(resolveBillingState(sub("trial"), null).state === "TRIAL", "trial → TRIAL");
  assert(resolveBillingState(sub("pending_payment"), null).state === "PENDING_PAYMENT", "pending_payment → PENDING_PAYMENT (not FAILED)");
  assert(resolveBillingState(sub("grace_period"), null).state === "GRACE", "grace_period → GRACE");
  assert(resolveBillingState(sub("suspended"), null).state === "PAYMENT_FAILED", "suspended → PAYMENT_FAILED");
  assert(resolveBillingState(sub("cancelled"), null).state === "CANCELLED", "cancelled → CANCELLED");
  assert(resolveBillingState(sub("expired"), null).state === "CANCELLED", "expired → CANCELLED");

  // ── 2. No subscription: only a REAL failed payment is a signal. ──
  assert(resolveBillingState(null, pay("failed")).state === "PAYMENT_FAILED", "no sub + failed payment → PAYMENT_FAILED");
  assert(resolveBillingState(null, null).state === "UNKNOWN", "no sub + no payment → UNKNOWN (not inferred overdue)");
  assert(resolveBillingState(null, pay("paid", true)).state === "UNKNOWN", "no sub + paid payment → UNKNOWN (not fabricated healthy)");

  // ── 3. Determinism. ──
  const a = JSON.stringify(resolveBillingState(sub("active"), null));
  const b = JSON.stringify(resolveBillingState(sub("active"), null));
  assert(a === b, "billing-state resolver is deterministic");

  // ── 4. Plan compatibility: precedence + conflict, never overwrite. ──
  const noConf = resolvePlanCompat({ subscriptionPlanTier: "professional", orgPlansPlan: "professional", organizationsPlan: "pro" });
  assert(noConf.canonical === "professional" && noConf.source === "subscription", "compat: subscription wins; pro≈professional");
  assert(noConf.conflict === false, "compat: pro vs professional is NOT a conflict (same normalized tier)");
  const conf = resolvePlanCompat({ subscriptionPlanTier: "office", orgPlansPlan: null, organizationsPlan: "starter" });
  assert(conf.conflict === true, "compat: office vs starter IS a conflict");
  assert(conf.canonical === "office" && conf.source === "subscription", "compat: conflict resolves to commercial source, raw preserved");
  assert(conf.raw.organization === "starter" && conf.raw.subscription === "office", "compat: raw values preserved (no overwrite)");
  const fallback = resolvePlanCompat({ subscriptionPlanTier: null, orgPlansPlan: null, organizationsPlan: "team" });
  assert(fallback.canonical === "office" && fallback.source === "organization", "compat: falls back to org enum (team→office)");
  const none = resolvePlanCompat({ subscriptionPlanTier: null, orgPlansPlan: null, organizationsPlan: null });
  assert(none.canonical === "starter" && none.source === "none", "compat: no data → starter/none (safe default)");

  // ── 5. Grow classification honesty. ──
  assert(classifyGrow({ checkoutUrl: false, webhookSecret: false }).classification === "SIMULATED", "grow: unconfigured → SIMULATED");
  assert(classifyGrow({ checkoutUrl: true, webhookSecret: true }).classification === "PARTIAL", "grow: configured → at most PARTIAL (never LIVE — no recurring)");
  assert(classifyGrow({ checkoutUrl: true, webhookSecret: false }).classification === "PARTIAL", "grow: half-configured → PARTIAL");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
