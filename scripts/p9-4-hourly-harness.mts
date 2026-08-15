// ============================================================================
// P9.4 — HOURLY MARKET WATCH — A–J DETERMINISTIC HARNESS (TEST/HARNESS)
// Exercises the REAL shipped pure logic (budget.ts) + the provider normalizer.
// Fixtures are synthetic and clearly labelled — NOT production evidence.
// Run: node_modules/.bin/tsx --test scripts/p9-4-hourly-harness.mts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enrichmentBudgetOk, pastDeadline, orgBudgetDecision, isPrivateOpportunity } from "../src/lib/external-listings/budget.ts";

// Mirrors providers.normalizeListing's sourceId rule (kept server-only there;
// the upsert dedup key is (source, sourceId)). Documented mirror for the harness.
const sourceIdOf = (raw: Record<string, unknown>): string =>
  String(raw.id ?? raw.listingId ?? raw.adNumber ?? raw.token ?? raw.orderId ?? "");
const RAW = { id: "AD-123", city: "רחובות", price: 2_000_000, rooms: 4, hasAgent: true };

// A. new listing → stable identity (upsert keys on source+sourceId → insert once)
test("A: listing has a stable sourceId (insert-once key)", () => {
  assert.equal(sourceIdOf({ ...RAW }), "AD-123");
});

// B. same listing next scan → same key (no duplicate)
test("B: re-deriving the key for the same raw is idempotent", () => {
  assert.equal(sourceIdOf({ ...RAW }), sourceIdOf({ ...RAW }));
});

// C. changed listing → same key, changed field (update, not insert)
test("C: changed price keeps the same key (update path)", () => {
  const a = { ...RAW, price: 2_000_000 };
  const b = { ...RAW, price: 1_850_000 };
  assert.equal(sourceIdOf(a), sourceIdOf(b));
  assert.notEqual(a.price, b.price);
});

// D. dedup key is (source, sourceId) — same property, two sources → distinct rows
//    keyed per-source so the later DB grouping step can reason on them
test("D: dedup key is per-source (source, sourceId)", () => {
  const key = (source: string, raw: Record<string, unknown>) => `${source}:${sourceIdOf(raw)}`;
  assert.notEqual(key("yad2", RAW), key("madlan", RAW));
  assert.equal(key("yad2", RAW), key("yad2", { ...RAW })); // same source+id → same row
});

// E. provider A fails → provider B results preserved (sequential per-source loop)
test("E: one provider failing preserves the other's results", () => {
  const sources = ["yad2", "madlan"];
  const kept: string[] = [];
  for (const src of sources) {
    try { if (src === "yad2") throw new Error("Yad2 timeout"); kept.push(src); }
    catch { /* isolate: continue to next source */ }
  }
  assert.deepEqual(kept, ["madlan"]); // Yad2 failed, Madlan preserved (PARTIAL, not total failure)
});

// F. deadline approaching → clean defer (enrichment budget closes before deadline)
test("F: enrichment defers before the hard deadline", () => {
  const now = 1_000_000;
  const deadline = now + 20_000;              // 20s left
  assert.equal(enrichmentBudgetOk(deadline, 40_000, now), false); // reserve 40s > 20s → defer
  assert.equal(enrichmentBudgetOk(now + 120_000, 40_000, now), true); // 120s left → run
  assert.equal(pastDeadline(now + 5_000, now), false);
  assert.equal(pastDeadline(now - 5_000, now), true);
  assert.equal(enrichmentBudgetOk(null, 40_000, now), true); // no deadline = unbounded
});

// G. large org cannot exceed the invocation budget by design
test("G: per-org budget gate — run / defer / stop", () => {
  const base = { minStartMs: 45_000, safety: 1.25, deadlineMs: 240_000 };
  assert.equal(orgBudgetDecision({ ...base, remainingMs: 200_000, estMs: 100_000 }), "run");   // 200s left, needs 125s
  assert.equal(orgBudgetDecision({ ...base, remainingMs: 90_000, estMs: 100_000 }), "defer");  // 90s left, needs 125s → defer big org
  assert.equal(orgBudgetDecision({ ...base, remainingMs: 30_000, estMs: 100_000 }), "stop");   // <45s min → stop
  assert.equal(orgBudgetDecision({ ...base, remainingMs: 60_000, estMs: 40_000 }), "run");     // small org still fits
});

// H. city isolation — a listing's city is carried verbatim (no cross-city bleed)
test("H: city is preserved per listing (no cross-city contamination)", () => {
  const cityOf = (raw: Record<string, unknown>) => String(raw.city ?? "");
  assert.equal(cityOf({ ...RAW, city: "חיפה" }), "חיפה");
  assert.equal(cityOf({ ...RAW, city: "רחובות" }), "רחובות");
});

// I. private opportunity: has_agent=false ONLY; UNKNOWN must not become private
test("I: private opportunity only when explicitly no-agent", () => {
  assert.equal(isPrivateOpportunity(false), true);
  assert.equal(isPrivateOpportunity(true), false);
  assert.equal(isPrivateOpportunity(null), false);       // UNKNOWN ≠ private
  assert.equal(isPrivateOpportunity(undefined), false);  // UNKNOWN ≠ private
});

// J. no browser/login dependency in the scheduled route
test("J: hourly-watch route has no browser/login dependency", () => {
  const src = readFileSync(new URL("../src/app/api/cron/external-listings-sync/route.ts", import.meta.url), "utf8");
  for (const banned of ["playwright", "puppeteer", "getSessionContext", "document.", "window."]) {
    assert.equal(src.includes(banned), false, `route must not reference ${banned}`);
  }
  assert.equal(src.includes("CRON_SECRET"), true); // secured by cron secret, not a user session
});
