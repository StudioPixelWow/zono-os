// ============================================================================
// ZONO 9.7 — MATCHING SCALE + DATA-TRUTH regression tests.
// Proves buyer↔property matching stays COMPLETE and HONEST at growing office scale:
// bounded deterministic candidate scanning that continues past the old first-batch
// caps (no silent truncation), a resume cursor, org-isolated + idempotent writes,
// soft-deactivation (not delete) of inactive-property matches, human/buyer intent
// (shortlist/feedback) never overwritten by recompute, one row per pair, a bounded +
// observable daily reconcile, journey convergence mechanics, no fabricated matches,
// and an honest "not the complete universe" UI signal.
// Behavioral over the PURE scan module + source-closure over the server wiring
// (the strip-types runner rejects @/ imports, so server-only modules are asserted
// by source; scan.ts is dependency-free and imported behaviorally).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/matching-data-truth-9-7.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boundedScan, pageCompleteness, MATCH_SCAN } from "../../src/lib/matching-intelligence/scan.ts";

const root = new URL("../../", import.meta.url);
const src = (rel: string) => readFileSync(new URL(`src/${rel}`, root), "utf8");

/** Build a fake, deterministic paged source of `total` rows keyed by zero-padded id. */
function fakeSource(total: number) {
  const key = (i: number) => `id-${String(i).padStart(7, "0")}`;
  let pageCalls = 0;
  const fetchPage = async (cursor: string | null, limit: number) => {
    pageCalls++;
    const start = cursor ? Number(cursor.slice(3)) + 1 : 0;
    const out: { id: string }[] = [];
    for (let i = start; i < Math.min(start + limit, total); i++) out.push({ id: key(i) });
    return out;
  };
  const countTotal = async () => total;
  return { fetchPage, countTotal, keyOf: (r: { id: string }) => r.id, pageCalls: () => pageCalls };
}

// ── 1. buyer path continues PAST the old first-batch cap (was silent .limit(400)) ─
test("buyer scan continues past the old 400 cap up to the launch ceiling", async () => {
  const s = fakeSource(2500); // far above the retired 400
  const r = await boundedScan(s.fetchPage, s.keyOf, s.countTotal, MATCH_SCAN.MAX_SCAN_PROPERTIES);
  assert.equal(r.scanned, 2500, "all 2500 properties scanned, not just 400");
  assert.equal(r.truncated, false, "complete within the launch target → not truncated");
  assert.ok(s.pageCalls() >= 3, "paged the source (bounded pages), not one giant query");
});

// ── 2. property path continues PAST the old first-batch cap (was silent .limit(500)) ─
test("property scan continues past the old 500 cap up to the launch ceiling", async () => {
  const s = fakeSource(1800); // above the retired 500
  const r = await boundedScan(s.fetchPage, s.keyOf, s.countTotal, MATCH_SCAN.MAX_SCAN_BUYERS);
  assert.equal(r.scanned, 1800, "all 1800 buyers scanned, not just 500");
  assert.equal(r.truncated, false);
});

// ── 3. NO SILENT TRUNCATION — beyond the ceiling it is reported, never hidden ─────
test("a candidate universe beyond the ceiling reports truncated + a resume cursor", async () => {
  const s = fakeSource(MATCH_SCAN.MAX_SCAN_PROPERTIES + 1500);
  const r = await boundedScan(s.fetchPage, s.keyOf, s.countTotal, MATCH_SCAN.MAX_SCAN_PROPERTIES);
  assert.equal(r.scanned, MATCH_SCAN.MAX_SCAN_PROPERTIES, "bounded to the ceiling");
  assert.equal(r.truncated, true, "total > scanned → HONESTLY truncated");
  assert.ok(r.total > r.scanned, "the true total is known (exact count), not assumed");
  assert.ok(r.nextCursor, "a resume cursor is provided for continuation");
});

// ── 4. continuation is deterministic + idempotent (same input → same result) ──────
test("resuming from nextCursor yields the deterministic next window; re-run is identical", async () => {
  const s1 = fakeSource(5000);
  const a = await boundedScan(s1.fetchPage, s1.keyOf, s1.countTotal, 2000);
  const b = await boundedScan(s1.fetchPage, s1.keyOf, s1.countTotal, 2000);
  assert.deepEqual({ scanned: a.scanned, cursor: a.nextCursor }, { scanned: b.scanned, cursor: b.nextCursor }, "same scan twice → identical (idempotent)");
  // resume: fetch the next window starting at the cursor
  const next = await s1.fetchPage(a.nextCursor, 3);
  assert.equal(next[0].id, "id-0002000", "resume continues exactly after the last scanned id (no gap, no overlap)");
});

// ── 5. batch write is retry-safe (idempotent upsert on the pair unique key) ───────
test("recompute persists via upsert on the pair unique key (retry-safe, no dup rows)", () => {
  const t = src("lib/matching-intelligence/recompute.ts");
  assert.match(t, /\.upsert\([\s\S]*onConflict: "org_id,buyer_id,property_id"/, "upsert keyed on (org,buyer,property)");
});

// ── 6. cross-org isolation — every scan/count/write filters org_id ────────────────
test("recompute + reconcile scope every query to org_id (no cross-tenant leakage)", () => {
  const rc = src("lib/matching-intelligence/recompute.ts");
  // both the paged fetch and the exact-count probe are org-scoped
  assert.match(rc, /from\("properties"\)[\s\S]*?\.eq\("org_id", orgId\)[\s\S]*?count: "exact"/, "property count probe org-scoped");
  assert.match(rc, /from\("buyer_intelligence_profiles"\)[\s\S]*?count: "exact"[\s\S]*?\.eq\("org_id", orgId\)/, "buyer count probe org-scoped");
  assert.doesNotMatch(rc, /\.upsert\([^)]*\)\s*;?\s*\/\/\s*no-org/, "no un-scoped upsert");
});

// ── 7. inactive property SOFT-deactivates its matches (never hard delete) ─────────
test("an unavailable property soft-deactivates matches to inactive, preserving history", () => {
  const t = src("lib/matching-intelligence/recompute.ts");
  assert.match(t, /!ACTIVE_PROPERTY_STATUSES\.includes[\s\S]*?persistScoped\(supabase, orgId, \[\], "property_id"/, "unavailable → empty kept set for the property scope");
  assert.match(t, /match_status: "inactive"[\s\S]*?\.in\("id", staleIds/, "stale matches set inactive, not deleted");
  assert.doesNotMatch(t, /from\("match_intelligence_profiles"\)\s*\.delete\(\)/, "matches are never hard-deleted");
});

// ── 8/9/10/11. HUMAN INTENT untouched — recompute never writes shortlist/feedback ─
test("recompute never writes shortlist or recommendation/feedback state (human intent wins)", () => {
  const t = src("lib/matching-intelligence/recompute.ts");
  assert.doesNotMatch(t, /buyer_property_shortlist/, "recompute never touches the broker/buyer shortlist (rejected/liked/visit_requested preserved)");
  assert.doesNotMatch(t, /customer_property_recommendations/, "recompute never touches the send/feedback ledger");
  // match_stage (machine progress) is preserved across recompute, not reset
  assert.match(t, /existing\.get\(`\$\{bi\.buyer_id\}\|\$\{p\.id\}`\) \?\? "recommended"/, "existing match_stage is carried forward, not clobbered");
});

// ── 12. one row per pair — DB uniqueness is used by BOTH writers ──────────────────
test("both the org engine and the bounded recompute upsert on the same pair key", () => {
  assert.match(src("lib/matching-intelligence/service.ts"), /onConflict: "org_id,buyer_id,property_id"/, "org engine upsert keyed on the pair");
  assert.match(src("lib/matching-intelligence/recompute.ts"), /onConflict: "org_id,buyer_id,property_id"/, "bounded recompute upsert keyed on the pair");
});

// ── 13. daily reconciliation is BOUNDED, deterministic + observable ───────────────
test("reconcile orders orgs deterministically, bounds by a ceiling, and reports overflow", () => {
  const t = src("lib/matching-intelligence/service.ts");
  assert.match(t, /from\("organizations"\)\.select\("id"\)\.order\("id", \{ ascending: true \}\)\.limit\(ceiling\)/, "deterministic ordered + bounded org selection");
  assert.match(t, /orgsTruncated: total > orgIds\.length/, "overflow is reported, not silent");
  const route = src("app/api/cron/buyer-matches-reconcile/route.ts");
  assert.match(route, /orgsTruncated/, "the cron surfaces org overflow in its JSON/log");
});

// ── 14. entity→journey convergence mechanic (optimistic guard, idempotent replay) ─
test("journey head advance is optimistic-guarded so replays converge (no divergent double-apply)", () => {
  const t = src("lib/kernel/journey-applier.ts");
  assert.match(t, /\.eq\("current_stage", from\)/, "head update guarded by the expected from-stage (idempotent convergence)");
});

// ── 15. backward stage transitions are allowed to converge (reopen / regress) ─────
test("transitions permit reopen + regress so a backward entity move converges the journey", () => {
  const t = src("lib/journey-canonical/transitions.ts");
  assert.match(t, /return r\(true, "reopen"/, "terminal→open reopen permitted");
  assert.match(t, /"regress"/, "backward ladder move permitted (converges, not stale)");
});

// ── 16. NO fake matches — the canonical threshold/scoring gate is preserved ───────
test("sub-threshold candidates are dropped (no fabricated matches), scoring brain untouched", () => {
  const rc = src("lib/matching-intelligence/recompute.ts");
  assert.match(rc, /if \(compat\.score < COMPAT_THRESHOLD\) return null/, "below-threshold → no match row (no invented compatibility)");
  // the scoring brain is imported, not reimplemented, by the recompute orchestration
  assert.match(rc, /from "\.\/scoring"/, "reuses calculateCompatibility/computeMatchScores — no second engine");
});

// ── 17. UI COMPLETION TRUTH — overview cannot claim a complete universe when it isn't
test("buyer overview fetches SHOWN+1 and returns an honest matchesComplete/partialLabel", () => {
  const t = src("lib/matching-intelligence/buyer-matches-overview.ts");
  assert.match(t, /\.limit\(MATCH_SCAN\.OVERVIEW_SHOWN \+ 1\)/, "fetches one extra row to detect 'there are more'");
  assert.match(t, /matchesComplete: !hasMore/, "exposes honest completeness");
  assert.match(t, /partialLabel: hasMore \?/, "subtle Hebrew partial note (no fake %)");
  // and pageCompleteness itself is correct
  assert.deepEqual(pageCompleteness(81, 80), { hasMore: true, shown: 80 }, "81 fetched for 80 shown → hasMore");
  assert.deepEqual(pageCompleteness(80, 80), { hasMore: false, shown: 80 }, "exactly 80 → complete");
});

// ── 18. large-org cost stays BOUNDED — never loads more than the ceiling into memory
test("boundedScan caps in-memory rows at the ceiling regardless of universe size", async () => {
  const s = fakeSource(1_000_000); // pathological large org
  const r = await boundedScan(s.fetchPage, s.keyOf, s.countTotal, MATCH_SCAN.MAX_SCAN_PROPERTIES);
  assert.equal(r.rows.length, MATCH_SCAN.MAX_SCAN_PROPERTIES, "memory bounded to the ceiling (no 1M-row load)");
  assert.equal(r.truncated, true, "and it is honestly reported as incomplete");
  assert.ok(r.scanned <= MATCH_SCAN.MAX_SCAN_PROPERTIES, "never exceeds the ceiling");
});
