// ============================================================================
// ZONO — Price-change policy: deterministic proof (pure, mocks-free). Slice 4.
// Run: node --experimental-strip-types --test scripts/price-drop-tests/price-change-policy.test.ts
// Covers: server-derived delta, meaningful-drop policy, price-increase rejection,
// customer-specific delta, marketability, back-on-market transition, ₪ format.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePriceDelta, isMeaningfulDrop, isMarketableStatus, isUnavailableStatus,
  isBackOnMarketTransition, formatIls, MIN_DROP_PCT, MIN_DROP_ABS,
} from "../../src/lib/customer-comm/price-change-policy.ts";

// A. Meaningful drop (2,350,000 → 2,250,000): 100k / 4.26% clears BOTH thresholds.
test("A meaningful drop clears thresholds", () => {
  const d = computePriceDelta(2_350_000, 2_250_000);
  assert.ok(d);
  assert.equal(d!.direction, "down");
  assert.equal(d!.dropAmount, 100_000);
  assert.equal(d!.dropPercent, 4.3);
  assert.equal(isMeaningfulDrop(2_350_000, 2_250_000), true);
});

// N. Price INCREASE is never a meaningful drop (no price-drop marketing).
test("N price increase is not a meaningful drop", () => {
  const d = computePriceDelta(2_250_000, 2_350_000);
  assert.equal(d!.direction, "up");
  assert.equal(d!.dropAmount, 0);
  assert.equal(isMeaningfulDrop(2_250_000, 2_350_000), false);
});

// Tiny drop below both thresholds → not meaningful.
test("tiny drop below thresholds is not meaningful", () => {
  assert.equal(isMeaningfulDrop(2_350_000, 2_340_000), false); // 10k / 0.43%
});

// Exactly the % threshold qualifies.
test("exactly the percentage threshold qualifies", () => {
  const d = computePriceDelta(1_000_000, 980_000); // 2%
  assert.equal(d!.dropPercent, MIN_DROP_PCT);
  assert.equal(isMeaningfulDrop(1_000_000, 980_000), true);
});

// Absolute threshold qualifies even below the % threshold.
test("absolute threshold qualifies below the percentage threshold", () => {
  const d = computePriceDelta(2_000_000, 2_000_000 - MIN_DROP_ABS); // 25k / 1.25%
  assert.ok(d!.dropPercent < MIN_DROP_PCT);
  assert.equal(d!.dropAmount, MIN_DROP_ABS);
  assert.equal(isMeaningfulDrop(2_000_000, 1_975_000), true);
});

// I. Customer-specific delta: two customers with different price_at_send.
test("I customer-specific delta reflects each customer's own price_at_send", () => {
  const current = 2_270_000;
  // Customer 1 saw 2,350,000 → 80k drop → meaningful.
  assert.equal(isMeaningfulDrop(2_350_000, current), true);
  assert.equal(computePriceDelta(2_350_000, current)!.dropAmount, 80_000);
  // Customer 2 saw 2,275,000 → 5k / 0.22% drop → NOT meaningful.
  assert.equal(isMeaningfulDrop(2_275_000, current), false);
});

// Invalid inputs → null (never trust garbage; no accidental "drop").
test("invalid inputs yield null delta", () => {
  assert.equal(computePriceDelta(0, 100), null);
  assert.equal(computePriceDelta(null, 100), null);
  assert.equal(computePriceDelta(100, -5), null);
  assert.equal(isMeaningfulDrop(0, 0), false);
});

// Equal prices → direction none, not a drop.
test("equal prices are not a drop", () => {
  const d = computePriceDelta(1_000_000, 1_000_000);
  assert.equal(d!.direction, "none");
  assert.equal(isMeaningfulDrop(1_000_000, 1_000_000), false);
});

// Marketability sets.
test("marketable vs unavailable status", () => {
  for (const s of ["active", "published", "ready"]) assert.equal(isMarketableStatus(s), true);
  for (const s of ["sold", "rented", "withdrawn", "archived"]) { assert.equal(isMarketableStatus(s), false); assert.equal(isUnavailableStatus(s), true); }
  assert.equal(isMarketableStatus("draft"), false);
  assert.equal(isMarketableStatus("under_offer"), false);
});

// O. Back-on-market transition: unavailable → marketable only.
test("O back-on-market transition detection", () => {
  assert.equal(isBackOnMarketTransition("sold", "active"), true);
  assert.equal(isBackOnMarketTransition("withdrawn", "published"), true);
  assert.equal(isBackOnMarketTransition("rented", "ready"), true);
  assert.equal(isBackOnMarketTransition("active", "sold"), false);   // going unavailable is not back-on-market
  assert.equal(isBackOnMarketTransition("draft", "active"), false);  // never was unavailable
  assert.equal(isBackOnMarketTransition("active", "published"), false);
});

// ₪ formatting.
test("formatIls renders Hebrew shekels", () => {
  assert.equal(formatIls(2_250_000), "₪2.25M");
  assert.equal(formatIls(25_000), "₪25,000");
  assert.equal(formatIls(null), "");
  assert.equal(formatIls(undefined), "");
});
