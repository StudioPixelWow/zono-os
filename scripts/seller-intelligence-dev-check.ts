/**
 * LOCAL-DEV-ONLY check for Seller Intelligence™ & the Exclusive Opportunity
 * Engine (Phase 14). Pure deterministic engine — no DB, no AI.
 *
 * Verifies: scores deterministic · private > broker · exclusive bands · lifecycle
 * transitions · recommended actions · smart follow-up task generation · contact
 * priority ranking (no duplicates, terminal excluded) · 100k-seller performance.
 *
 * Run: npx tsx scripts/seller-intelligence-dev-check.ts
 */
import {
  evaluateSellerOpportunity, rankContactPriority, smartFollowupRules,
  calculateSellerOpportunityScore, calculateExclusiveProbability, bandFor,
} from "../src/lib/exclusive-acquisition";
import type { EvaluateInput } from "../src/lib/exclusive-acquisition";
import type { SellerProfile, SellerScoreInput } from "../src/lib/exclusive-acquisition/types";

function feat(over: Partial<SellerScoreInput> = {}): SellerScoreInput {
  return {
    daysOnMarket: 20, priceDropCount: 0, returnedToMarket: false, removedAndRepublished: false,
    isPrivateListing: true, marketExposureDays: 20, buyerDemandIndex: 0, matchingBuyerCount: 0,
    previousContactCount: 0, marketTrendDelta: 0, respondedBefore: false, recentActivity: false, ...over,
  };
}
function evalInput(over: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    features: feat(over.features), currentStage: over.currentStage ?? "new_opportunity",
    contactAttempts: over.contactAttempts ?? 0, hoursSinceLastContact: over.hoursSinceLastContact ?? null,
    hasPositiveResponse: over.hasPositiveResponse ?? false, priceDroppedRecently: over.priceDroppedRecently ?? false,
    removed: over.removed ?? false, lastOutcome: over.lastOutcome ?? null,
  };
}

function profile(over: Partial<SellerProfile>): SellerProfile {
  return {
    id: over.id ?? "p", marketPropertySourceId: over.marketPropertySourceId ?? "s", linkedPropertyId: null,
    provider: "yad2", city: "חיפה", neighborhood: null, addressText: "הרצל 1", listingType: over.listingType ?? "private",
    price: 2_000_000, sellerScore: over.sellerScore ?? 50, exclusiveProbability: over.exclusiveProbability ?? 50,
    exclusiveBand: over.exclusiveBand ?? "medium", scoreReasons: [], probabilityReasons: [],
    recommendedAction: over.recommendedAction ?? "wait", recommendedActionReason: "", priorityRank: 0,
    buyerMatchCount: over.buyerMatchCount ?? 0, daysOnMarket: over.daysOnMarket ?? 20, priceDropCount: over.priceDropCount ?? 0,
    lifecycleStage: over.lifecycleStage ?? "new_opportunity", lastContactAt: over.lastContactAt ?? null, nextFollowupAt: null,
  };
}

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("ZONO Seller Intelligence™ / Exclusive Opportunity dev-check\n");

  // 1) Deterministic — same input ⇒ identical output.
  const inp = evalInput({ features: feat({ isPrivateListing: true, priceDropCount: 2, matchingBuyerCount: 3, daysOnMarket: 70 }) });
  const a = evaluateSellerOpportunity(inp), b = evaluateSellerOpportunity(inp);
  assert(JSON.stringify(a) === JSON.stringify(b), "evaluation is deterministic (identical output on re-run)");
  assert(a.score >= 0 && a.score <= 100 && a.probability >= 0 && a.probability <= 100, "scores clamped to 0–100");

  // 2) Private beats broker.
  const priv = calculateSellerOpportunityScore(feat({ isPrivateListing: true }));
  const broker = calculateSellerOpportunityScore(feat({ isPrivateListing: false }));
  assert(priv.score > broker.score, `private listing scores higher than broker (${priv.score} > ${broker.score})`);
  const privP = calculateExclusiveProbability(feat({ isPrivateListing: true }), priv.score);
  const brokerP = calculateExclusiveProbability(feat({ isPrivateListing: false }), broker.score);
  assert(privP.probability > brokerP.probability, "private exclusive probability higher than broker");

  // 3) Bands.
  assert(bandFor(96) === "very_high" && bandFor(82) === "high" && bandFor(64) === "medium" && bandFor(38) === "low", "band thresholds (96→very_high, 82→high, 64→medium, 38→low)");
  assert(privP.reasons.length > 0, "probability is explained (reasons present)");

  // 4) Lifecycle transitions.
  assert(evaluateSellerOpportunity(evalInput({ features: feat({ isPrivateListing: true, matchingBuyerCount: 3 }) })).lifecycleStage === "contact_recommended", "new + high probability → contact_recommended");
  assert(evaluateSellerOpportunity(evalInput({ currentStage: "contacted", contactAttempts: 1, hoursSinceLastContact: 50 })).lifecycleStage === "follow_up", "contacted + 50h no response → follow_up");
  assert(evaluateSellerOpportunity(evalInput({ currentStage: "contacted", contactAttempts: 1, lastOutcome: "exclusive_signed" })).lifecycleStage === "exclusive_signed", "outcome signed → exclusive_signed");
  assert(evaluateSellerOpportunity(evalInput({ currentStage: "contacted", contactAttempts: 1, lastOutcome: "declined" })).lifecycleStage === "lost", "outcome declined → lost");
  assert(evaluateSellerOpportunity(evalInput({ currentStage: "contacted", contactAttempts: 1, removed: true })).lifecycleStage === "archived", "removed listing → archived");

  // 5) Recommended actions.
  assert(evaluateSellerOpportunity(evalInput({ features: feat({ isPrivateListing: true, matchingBuyerCount: 4 }) })).recommendation.kind === "call_today", "strong uncontacted → call_today");
  assert(evaluateSellerOpportunity(evalInput({ priceDroppedRecently: true, features: feat({ isPrivateListing: true, priceDropCount: 2 }) })).recommendation.kind === "call_today", "price drop → call_today");
  assert(evaluateSellerOpportunity(evalInput({ currentStage: "contacted", contactAttempts: 1, hoursSinceLastContact: 3 })).recommendation.kind === "wait", "freshly contacted → wait");
  assert(evaluateSellerOpportunity(evalInput({ features: feat({ isPrivateListing: false, daysOnMarket: 5, buyerDemandIndex: 0 }) })).recommendation.kind !== "call_today", "weak broker listing not urgent");

  // 6) Smart follow-up generation.
  const fpd = smartFollowupRules({ contactAttempts: 1, hasPositiveResponse: false, hoursSinceLastContact: 1, priceDroppedRecently: true, newBuyerMatch: false, exclusiveProbability: 80 });
  assert(fpd.some((f) => f.reason === "price_drop" && f.action === "call"), "price drop → call follow-up task");
  const fb = smartFollowupRules({ contactAttempts: 0, hasPositiveResponse: false, hoursSinceLastContact: null, priceDroppedRecently: false, newBuyerMatch: true, exclusiveProbability: 75 });
  assert(fb.some((f) => f.reason === "buyer_found" && f.action === "schedule_showing"), "buyer found → schedule showing task");
  const fnr = smartFollowupRules({ contactAttempts: 1, hasPositiveResponse: false, hoursSinceLastContact: 60, priceDroppedRecently: false, newBuyerMatch: false, exclusiveProbability: 60 });
  assert(fnr.some((f) => f.reason === "no_response"), "no response 2 days → follow-up task");
  const ffresh = smartFollowupRules({ contactAttempts: 1, hasPositiveResponse: false, hoursSinceLastContact: 5, priceDroppedRecently: false, newBuyerMatch: false, exclusiveProbability: 60 });
  assert(ffresh.length === 0, "freshly contacted, no triggers → no follow-up tasks (no spam)");

  // 7) Contact priority ranking — private/high ranks above low; terminal excluded; no dupes.
  const profiles: SellerProfile[] = [
    profile({ id: "hi", exclusiveProbability: 92, exclusiveBand: "very_high", listingType: "private", buyerMatchCount: 4 }),
    profile({ id: "lo", exclusiveProbability: 30, exclusiveBand: "low", listingType: "broker" }),
    profile({ id: "signed", exclusiveProbability: 99, exclusiveBand: "very_high", lifecycleStage: "exclusive_signed" }),
  ];
  const ranked = rankContactPriority(profiles, {}, 25);
  assert(ranked[0]?.profileId === "hi", "highest opportunity ranked first");
  assert(!ranked.some((r) => r.profileId === "signed"), "signed/terminal sellers excluded from today's priorities");
  assert(new Set(ranked.map((r) => r.profileId)).size === ranked.length, "no duplicate sellers in ranking");

  // 8) Performance — 100,000 sellers, rule engine only.
  const big: EvaluateInput[] = Array.from({ length: 100_000 }, (_, i) => evalInput({ features: feat({ priceDropCount: i % 4, matchingBuyerCount: i % 6, daysOnMarket: i % 120, isPrivateListing: i % 2 === 0 }) }));
  const t0 = Date.now();
  for (const x of big) evaluateSellerOpportunity(x);
  const ms = Date.now() - t0;
  assert(ms < 3000, `evaluated 100,000 sellers in ${ms}ms (< 3000ms, no AI)`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main();
