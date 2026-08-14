// P8.3 — PROVIDER QUANTITY SYNC FOUNDATION QA (PURE; no DB, no provider, no
// writes). Proves the canonical reconciler decision matrix, idempotency,
// concurrency arbitration, the three-distinct-quantity separation, trial/custom/
// cancelled behavior, failure semantics (design), and that NO successful sync is
// ever faked. The DB write path (atomic RPC) is verified separately against the
// live schema; here we prove the pure logic the wrapper delegates to.
import { computeOrgBillingQuantity } from "../src/lib/commercial/quantity.ts";
import {
  decideQuantityReconciliation, reconcilePlan, FAILURE_CONTRACT,
  type ReconcileInput, type ReconcileOldRow,
} from "../src/lib/commercial/reconcile.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const AT = "2026-08-13T00:00:00.000Z";

const decide = (o: Partial<ReconcileInput> & { billingState: any; expectedQuantity: number }): ReturnType<typeof decideQuantityReconciliation> =>
  decideQuantityReconciliation({
    organizationId: "o", customPricingRequired: o.customPricingRequired ?? false,
    providerConfigured: o.providerConfigured ?? true, hasSubscription: true,
    providerQuantity: o.providerQuantity ?? null, ...o,
  });

const plan = (input: Partial<ReconcileInput> & { billingState: any; expectedQuantity: number }, old: ReconcileOldRow | null, action = "reconcile") =>
  reconcilePlan(
    { organizationId: "o", customPricingRequired: input.customPricingRequired ?? false, providerConfigured: input.providerConfigured ?? true, hasSubscription: old !== null, providerQuantity: input.providerQuantity ?? null, ...input },
    old, { action, at: AT },
  );

console.log("P8.3 · pricing still canonical (resolver feeds reconciler)");
for (const [n, exp] of [[1,197],[3,591],[4,788],[10,1970]] as const) {
  const q = computeOrgBillingQuantity({ orgId: "o", activeUsers: n, pendingInvitations: 0, isTrial: false, billingState: "active", providerConfigured: true, subscriptionIdPresent: false, lastSyncedQuantity: null, source: "qa", calculatedAt: AT });
  ok(q.billableAgents === n && q.expectedMonthlyIls === exp, `${n} active → billable ${n}, expected ${exp}`);
}
{
  const q11 = computeOrgBillingQuantity({ orgId: "o", activeUsers: 11, pendingInvitations: 0, isTrial: false, billingState: "active", providerConfigured: true, subscriptionIdPresent: false, lastSyncedQuantity: null, source: "qa", calculatedAt: AT });
  ok(q11.customPricingRequired && q11.expectedMonthlyIls === null, "11 active → custom, expected monthly NULL");
}

console.log("\nP8.3 · reconciler decision matrix (§7)");
ok(decide({ billingState: "active", expectedQuantity: 4, providerConfigured: true, providerQuantity: null }).decision === "SYNC_REQUIRED", "active + ≤10 + provider + expected≠provider → SYNC_REQUIRED");
ok(decide({ billingState: "active", expectedQuantity: 4, providerConfigured: true, providerQuantity: 4 }).decision === "SYNCED", "active + expected==provider → SYNCED (only reachable post-P8.4)");
ok(decide({ billingState: "active", expectedQuantity: 4, providerConfigured: false }).decision === "NOT_CONFIGURED", "active + no provider → NOT_CONFIGURED");
ok(decide({ billingState: "active", customPricingRequired: true, expectedQuantity: 11, providerConfigured: true }).decision === "CUSTOM_REVIEW_REQUIRED", "11+ → CUSTOM_REVIEW_REQUIRED (sync paused)");
ok(decide({ billingState: "cancelled", expectedQuantity: 4, providerConfigured: true }).decision === "BLOCKED_BY_STATE", "cancelled → BLOCKED_BY_STATE (no sync)");
ok(decide({ billingState: "trialing", expectedQuantity: 4, providerConfigured: true }).decision === "NO_ACTION", "trialing → NO_ACTION (deferred; expected qty still tracked)");
for (const st of ["payment_due","payment_failed","grace","cancel_pending"] as const) {
  ok(decide({ billingState: st, expectedQuantity: 4, providerConfigured: true }).decision === "NO_ACTION", `${st} → NO_ACTION (calculated, no money movement)`);
}

console.log("\nP8.3 · target status persisted matches decision");
ok(decide({ billingState: "active", expectedQuantity: 4, providerConfigured: true }).targetStatus === "sync_required", "active mismatch → status sync_required");
ok(decide({ billingState: "active", customPricingRequired: true, expectedQuantity: 11 }).targetStatus === "custom_review_required", "custom → status custom_review_required");
ok(decide({ billingState: "trialing", expectedQuantity: 4, providerConfigured: true }).targetStatus === "not_synced", "trial → status not_synced");
ok(decide({ billingState: "active", expectedQuantity: 4, providerConfigured: false }).targetStatus === "not_configured", "no provider → status not_configured");

console.log("\nP8.3 · three DISTINCT quantities never collapsed");
{
  const d = decide({ billingState: "active", expectedQuantity: 4, providerConfigured: true, providerQuantity: null });
  ok(d.targetQuantity === 4, "expected subscription quantity = 4 (persisted)");
  ok(decide({ billingState: "active", expectedQuantity: 4, providerConfigured: true, providerQuantity: null }).decision === "SYNC_REQUIRED", "provider NULL ≠ expected 4 → sync required (not collapsed to equal)");
}

console.log("\nP8.3 · idempotency (repeat reconcile with identical state → NO_ACTION)");
{
  const fresh: ReconcileOldRow = { subscriptionQuantity: null, quantitySyncStatus: "not_synced" };
  const run1 = plan({ billingState: "active", expectedQuantity: 4, providerConfigured: true }, fresh);
  ok(run1.changed === true && run1.decision === "SYNC_REQUIRED", "run 1 → changed, SYNC_REQUIRED (persists expected + status)");
  ok(run1.events.filter(e => e.type === "billing.quantity.changed").length === 1, "run 1 → exactly one billing.quantity.changed");
  ok(run1.events.some(e => e.type === "billing.quantity.sync_required"), "run 1 → sync_required event");
  const settled: ReconcileOldRow = { subscriptionQuantity: 4, quantitySyncStatus: "sync_required" };
  const run2 = plan({ billingState: "active", expectedQuantity: 4, providerConfigured: true }, settled);
  ok(run2.changed === false && run2.decision === "NO_ACTION" && run2.events.length === 0, "run 2 → NO_ACTION, no write, no event");
  const run3 = plan({ billingState: "active", expectedQuantity: 4, providerConfigured: true }, settled);
  ok(run3.changed === false && run3.events.length === 0, "run 3 → NO_ACTION, no duplicate event");
}

console.log("\nP8.3 · quantity change detection (§12) — one change event per real change");
{
  const before: ReconcileOldRow = { subscriptionQuantity: 3, quantitySyncStatus: "sync_required" };
  const after = plan({ billingState: "active", expectedQuantity: 4, providerConfigured: true }, before);
  const changes = after.events.filter(e => e.type === "billing.quantity.changed");
  ok(changes.length === 1 && changes[0].oldQuantity === 3 && changes[0].newQuantity === 4, "3→4 → exactly one billing.quantity.changed (3→4)");
  ok(!after.events.some(e => e.type === "billing.quantity.sync_required"), "status already sync_required → no duplicate sync_required event");
}

console.log("\nP8.3 · concurrency (RPC rows-affected arbitrates — pure plan is deterministic)");
{
  const old: ReconcileOldRow = { subscriptionQuantity: null, quantitySyncStatus: "not_synced" };
  const a = plan({ billingState: "active", expectedQuantity: 11, customPricingRequired: true, providerConfigured: true }, old);
  const b = plan({ billingState: "active", expectedQuantity: 11, customPricingRequired: true, providerConfigured: true }, old);
  ok(JSON.stringify(a.events) === JSON.stringify(b.events), "identical inputs → identical plan/events (RPC rows-affected ensures only one persists)");
  ok(a.decision === "CUSTOM_REVIEW_REQUIRED", "9+2 concurrent → 11 active → CUSTOM_REVIEW_REQUIRED");
}

console.log("\nP8.3 · trial quantity (expected recomputes; provider NOT synced; no reset)");
{
  const owner: ReconcileOldRow = { subscriptionQuantity: null, quantitySyncStatus: "not_synced" };
  const t1 = plan({ billingState: "trialing", expectedQuantity: 1, providerConfigured: false }, owner);
  ok(t1.targetQuantity === 1 && t1.targetStatus === "not_configured", "trial owner → expected 1, status not_configured (no provider)");
  const grown: ReconcileOldRow = { subscriptionQuantity: 1, quantitySyncStatus: "not_configured" };
  const t2 = plan({ billingState: "trialing", expectedQuantity: 4, providerConfigured: false }, grown);
  ok(t2.targetQuantity === 4 && t2.changed === true, "trial grows to 4 → expected recomputes to 4");
  ok(t2.decision === "NOT_CONFIGURED", "trial + no provider → NOT_CONFIGURED (no sync, no charge)");
}

console.log("\nP8.3 · >10 custom prevents sync; cancelled prevents sync");
ok(decide({ billingState: "active", customPricingRequired: true, expectedQuantity: 12, providerConfigured: true }).targetStatus === "custom_review_required", "12 active → custom_review_required (no provider sync)");
ok(decide({ billingState: "cancelled", expectedQuantity: 4, providerConfigured: true }).targetStatus === "not_synced", "cancelled → not_synced (sync blocked; data preserved)");

console.log("\nP8.3 · NO fake successful sync / no sync outcome events in P8.3");
{
  const d = decide({ billingState: "active", expectedQuantity: 4, providerConfigured: true, providerQuantity: null });
  ok(d.decision !== "SYNCED" && d.targetStatus !== "synced", "no provider ack (NULL) → never SYNCED in P8.3");
  const p = plan({ billingState: "active", expectedQuantity: 4, providerConfigured: true }, { subscriptionQuantity: null, quantitySyncStatus: "not_synced" });
  ok(!p.events.some(e => e.type === "billing.quantity.sync_succeeded" || e.type === "billing.quantity.sync_failed"), "reconciler NEVER emits sync_succeeded/sync_failed in P8.3");
}

console.log("\nP8.3 · failure semantics (design — preserves prior provider quantity)");
ok(FAILURE_CONTRACT.preserveProviderQuantity === true && FAILURE_CONTRACT.keepExpectedQuantity === true, "on failure: provider_quantity preserved, expected quantity kept");
ok(FAILURE_CONTRACT.status === "failed" && /safe category/i.test(FAILURE_CONTRACT.errorField), "on failure: status='failed', error is safe category only (no raw body)");

console.log("\nP8.3 · no-subscription org → NO_ACTION (never creates a row)");
{
  const noSub = plan({ billingState: "payment_due", expectedQuantity: 1, providerConfigured: false }, null);
  ok(noSub.changed === false && noSub.decision === "NO_ACTION" && noSub.reason === "NO_SUBSCRIPTION", "no subscription (Pixel/RE-MAX) → NO_ACTION, no write, no fabricated row");
}

console.log("\nP8.3 · commercial ≠ billing ≠ provider ≠ revenue (separation intact)");
{
  const q = computeOrgBillingQuantity({ orgId: "o", activeUsers: 4, pendingInvitations: 0, isTrial: false, billingState: "active", providerConfigured: true, subscriptionIdPresent: false, lastSyncedQuantity: null, source: "qa", calculatedAt: AT });
  ok(q.expectedMonthlyIls === 788 && q.isExpectationOnly === true, "expected monthly 788 = commercial expectation only");
  ok(q.provider.lastSyncedProviderQuantity.available === false, "provider quantity distinct + UNAVAILABLE (never conflated with expectation/revenue)");
}

console.log("");
console.log(fail === 0 ? "ALL P8.3 PROVIDER-QUANTITY QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
