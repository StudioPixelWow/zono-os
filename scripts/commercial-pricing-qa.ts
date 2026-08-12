// ZONO — Flat pricing model QA (deterministic). Run: npx tsx scripts/commercial-pricing-qa.ts
import { computeSeatBilling, isSelfServeSeatCount, computeTrialInfo, trialEndsAtIso, trialDaysRemaining, seatBillingSummaryHe, SEAT_PRICE_ILS, TRIAL_DAYS, ENTERPRISE_SEAT_THRESHOLD } from "../src/lib/commercial/pricing";
import { PLANS, PLAN_ORDER, planAllows, ENTITLEMENTS } from "../src/lib/launch/plans";
import { normalizePlanTier } from "../src/lib/platform-admin/access/model";

let failed = 0;
const ok = (c: boolean, l: string) => { if (c) console.log("  ✓ " + l); else { console.log("  ✗ " + l); failed++; } };

console.log("Pricing · flat model constants");
ok(SEAT_PRICE_ILS === 197, "seat price = 197 ₪");
ok(TRIAL_DAYS === 14, "trial = 14 days");
ok(ENTERPRISE_SEAT_THRESHOLD === 10, "enterprise threshold = 10 agents");
ok(PLAN_ORDER.length === 2 && PLAN_ORDER[0] === "standard" && PLAN_ORDER[1] === "enterprise", "two plans: standard, enterprise");

console.log("\nPricing · all features open on BOTH plans (no gating by tier)");
const all = Object.values(ENTITLEMENTS);
ok(all.every((e) => planAllows("standard", e as never)), "standard grants EVERY entitlement");
ok(all.every((e) => planAllows("enterprise", e as never)), "enterprise grants EVERY entitlement");
ok(PLANS.standard.priceHintIls === 197 && PLANS.enterprise.priceHintIls === null, "standard=197, enterprise=null (contact)");
ok(Object.values(PLANS).every((p) => p.limits.seats === -1 && p.limits.monitoredListings === -1), "no feature limits (all unlimited)");

console.log("\nPricing · seat billing (197 × active agents)");
ok(computeSeatBilling(1).totalIls === 197, "1 agent → 197 ₪");
ok(computeSeatBilling(3).totalIls === 591, "3 agents → 591 ₪");
ok(computeSeatBilling(5).totalIls === 985, "5 agents → 985 ₪");
ok(computeSeatBilling(10).totalIls === 1970, "10 agents → 1,970 ₪");
ok(!computeSeatBilling(10).isEnterprise, "10 agents → still self-serve");
ok(computeSeatBilling(11).isEnterprise, "11 agents → enterprise (custom)");
ok(isSelfServeSeatCount(10) && !isSelfServeSeatCount(11) && !isSelfServeSeatCount(0), "self-serve range = 1..10");
ok(seatBillingSummaryHe(computeSeatBilling(5)).includes("985"), "summary shows total for 5 agents");

console.log("\nPricing · trial (14 days)");
const NOW = Date.parse("2026-08-12T09:00:00Z");
const start = "2026-08-01T00:00:00Z";
ok(trialEndsAtIso(start) === new Date(Date.parse(start) + 14 * 86400000).toISOString(), "trial ends 14 days after start");
const info = computeTrialInfo(start, null, NOW);
ok(info.daysRemaining === 3, `11 days in → 3 days remaining [got ${info.daysRemaining}]`);
ok(!info.expired, "not expired at day 11");
ok(trialDaysRemaining("2026-08-10T00:00:00Z", NOW) === 0, "past end date → 0 remaining");
ok(computeTrialInfo("2026-07-01T00:00:00Z", null, NOW).expired, "old trial → expired");
ok(trialDaysRemaining(null, NOW) === null, "no trial date → null");

console.log("\nPricing · legacy tier normalization (backward compat)");
ok(normalizePlanTier("starter") === "standard", "legacy starter → standard");
ok(normalizePlanTier("professional") === "standard", "legacy professional → standard");
ok(normalizePlanTier("office") === "standard", "legacy office → standard");
ok(normalizePlanTier("pro") === "standard", "legacy enum pro → standard");
ok(normalizePlanTier("team") === "standard", "legacy enum team → standard");
ok(normalizePlanTier("enterprise") === "enterprise", "enterprise → enterprise");
ok(normalizePlanTier(null) === "standard", "null → standard");

console.log("");
if (failed === 0) console.log("ALL CHECKS PASSED");
else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
