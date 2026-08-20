// ============================================================================
// ZONO — Hardening: deal stage terminal round-trip (Phase 15, matrix S). PURE.
// Run: node --experimental-strip-types --test scripts/hardening-tests/deal-stage-roundtrip.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_TO_DEAL_STAGE, DEAL_TO_PROFILE_STAGE, profileToDealStage, dealToProfileStage,
} from "../../src/lib/deals/stage-map.ts";

test("terminal states round-trip deterministically", () => {
  // profile 'closed' == won ; back to profile 'closed'
  assert.equal(profileToDealStage("closed"), "won");
  assert.equal(dealToProfileStage("won"), "closed");
  assert.equal(dealToProfileStage(profileToDealStage("closed")), "closed");
  // lost round-trips to lost
  assert.equal(profileToDealStage("lost"), "lost");
  assert.equal(dealToProfileStage("lost"), "lost");
  assert.equal(profileToDealStage(dealToProfileStage("lost")), "lost");
  // canonical 'won' round-trips back to 'won'
  assert.equal(profileToDealStage(dealToProfileStage("won")), "won");
  // signed near-terminal
  assert.equal(dealToProfileStage(profileToDealStage("signed")), "signed");
});

test("won and lost are NEVER collapsed onto each other or onto 'new'", () => {
  assert.notEqual(PROFILE_TO_DEAL_STAGE["closed"], PROFILE_TO_DEAL_STAGE["lost"]);
  assert.notEqual(DEAL_TO_PROFILE_STAGE["won"], DEAL_TO_PROFILE_STAGE["lost"]);
  assert.notEqual(profileToDealStage("closed"), "new");
  assert.notEqual(profileToDealStage("lost"), "new");
  assert.notEqual(dealToProfileStage("won"), "new_opportunity");
  assert.notEqual(dealToProfileStage("lost"), "new_opportunity");
});

test("intentional non-terminal collapses are preserved", () => {
  assert.equal(profileToDealStage("contacted"), "new");
  assert.equal(profileToDealStage("offer_sent"), "negotiation");
  assert.equal(profileToDealStage("offer_received"), "negotiation");
  assert.equal(profileToDealStage("property_visit"), "qualified");
});

test("unknown/empty falls back to the non-terminal default (not a terminal)", () => {
  assert.equal(profileToDealStage("gibberish"), "new");
  assert.equal(profileToDealStage(null), "new");
  assert.equal(dealToProfileStage("gibberish"), "new_opportunity");
  assert.equal(dealToProfileStage(undefined), "new_opportunity");
});
