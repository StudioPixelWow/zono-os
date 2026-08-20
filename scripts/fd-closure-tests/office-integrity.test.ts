// ============================================================================
// ZONO — Performance/Integrity closure: deterministic pure coverage for the
// CANONICAL office status predicates (the single source of truth shared by the
// /office board and the agent drill-down — Phase 16 status consistency). The
// DB-scoped matrix items (cross-org link denial, recommendation/notification
// uniqueness mechanisms, service-role org requirement, public-DTO stripping,
// buyer/seller privacy, orphan-safe selectors) are enforced by DB constraints
// (verified present in the index/orphan audit — all 0) + the authed runtime and
// are reported HUMAN_REQUIRED / audit-verified (no fake PASS).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/office-integrity.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isActiveLeadStage, isActivePropertyStatus, isOpenDeal, isLateDealStage,
  ACTIVE_LEAD_STAGES, ACTIVE_PROPERTY_STATUS,
} from "../../src/lib/office/status-predicates.ts";

// ── C — active-lead predicate ────────────────────────────────────────────────
test("C: active-lead stage = working funnel only; converted/lost excluded", () => {
  for (const s of ["new", "contacted", "qualified", "nurturing"]) assert.equal(isActiveLeadStage(s), true, s);
  for (const s of ["converted", "lost", "archived", ""]) assert.equal(isActiveLeadStage(s), false, s);
});

// ── D — active-property + open/late-deal predicates ──────────────────────────
test("D: active-property status = live inventory only", () => {
  for (const s of ["active", "published", "ready", "under_offer", "in_contract"]) assert.equal(isActivePropertyStatus(s), true, s);
  for (const s of ["draft", "sold", "rented", "withdrawn", "archived"]) assert.equal(isActivePropertyStatus(s), false, s);
});
test("D: open deal = status 'open'; late stages are agreement/contract/closing", () => {
  assert.equal(isOpenDeal("open"), true);
  for (const s of ["won", "lost"]) assert.equal(isOpenDeal(s), false, s);
  for (const s of ["agreement", "contract", "closing"]) assert.equal(isLateDealStage(s), true, s);
  for (const s of ["new", "qualified", "negotiation"]) assert.equal(isLateDealStage(s), false, s);
});

// ── L — count parity: the predicate IS the count definition (no drift) ───────
test("L: counting via the predicate equals filtering by the canonical set", () => {
  const leads = [{ stage: "new" }, { stage: "contacted" }, { stage: "lost" }, { stage: "converted" }, { stage: "qualified" }];
  const viaPredicate = leads.filter((l) => isActiveLeadStage(l.stage)).length;
  const viaSet = leads.filter((l) => ACTIVE_LEAD_STAGES.has(l.stage)).length;
  assert.equal(viaPredicate, viaSet);
  assert.equal(viaPredicate, 3);

  const props = [{ s: "active" }, { s: "draft" }, { s: "sold" }, { s: "under_offer" }];
  assert.equal(props.filter((p) => isActivePropertyStatus(p.s)).length, [...ACTIVE_PROPERTY_STATUS].length && props.filter((p) => ACTIVE_PROPERTY_STATUS.has(p.s)).length);
  assert.equal(props.filter((p) => isActivePropertyStatus(p.s)).length, 2);
});

// ── consistency: office predicates are distinct, stable sets (no accidental overlap) ─
test("status sets are the documented office definitions (guards against silent drift)", () => {
  assert.deepEqual([...ACTIVE_LEAD_STAGES].sort(), ["contacted", "new", "nurturing", "qualified"]);
  assert.deepEqual([...ACTIVE_PROPERTY_STATUS].sort(), ["active", "in_contract", "published", "ready", "under_offer"]);
});
