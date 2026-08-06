// Offer↔entity linkage + offer→deal conversion pure-logic tests. Run with:
//   node --experimental-strip-types --test scripts/epic3-tests/offer-linkage.test.ts
// No test-runner dependency (Node built-in node:test). Deterministic, I/O-free:
// exercises the extracted linkage rules that back the offer form, match-origin
// offers, seller derivation and the idempotent conversion decision.
import { test } from "node:test";
import assert from "node:assert/strict";

import { requireBuyerAndProperty, deriveSellerId, conversionDecision } from "../../src/lib/offers/linkage-rules.ts";
import type { CreateOfferInput } from "../../src/lib/offers/service.ts";

// A match-shaped row (as returned org-scoped from match_intelligence_profiles).
type MatchLike = { buyer_id: string | null; property_id: string | null; seller_id: string | null };
// Mirror of createOfferFromMatch's PURE derivation (buyer/property/seller from a match).
function deriveOfferFromMatch(match: MatchLike): { buyerId: string | null; propertyId: string | null; sellerId: string | null } {
  return { buyerId: match.buyer_id, propertyId: match.property_id, sellerId: match.seller_id };
}

test("offer-from-match derives buyer + property + seller from the match row", () => {
  const match: MatchLike = { buyer_id: "b1", property_id: "p1", seller_id: "s1" };
  const d = deriveOfferFromMatch(match);
  assert.deepEqual(d, { buyerId: "b1", propertyId: "p1", sellerId: "s1" });
  // and the derived triangle satisfies the generic requirement
  assert.equal(requireBuyerAndProperty({ buyerId: d.buyerId, propertyId: d.propertyId }).ok, true);
});

test("offer-from-match with no linked seller still derives buyer + property", () => {
  const d = deriveOfferFromMatch({ buyer_id: "b1", property_id: "p1", seller_id: null });
  assert.deepEqual(d, { buyerId: "b1", propertyId: "p1", sellerId: null });
});

test("generic form requires BOTH buyer and property", () => {
  assert.deepEqual(requireBuyerAndProperty({ buyerId: "b1", propertyId: "p1" }), { ok: true, missing: [] });
  assert.deepEqual(requireBuyerAndProperty({ buyerId: "b1" }), { ok: false, missing: ["property"] });
  assert.deepEqual(requireBuyerAndProperty({ propertyId: "p1" }), { ok: false, missing: ["buyer"] });
  assert.deepEqual(requireBuyerAndProperty({}), { ok: false, missing: ["buyer", "property"] });
  // empty strings count as missing
  assert.equal(requireBuyerAndProperty({ buyerId: "", propertyId: "" }).ok, false);
});

test("deriveSellerId prefers explicit, else property owner, else null", () => {
  assert.equal(deriveSellerId("owner", "explicit"), "explicit");
  assert.equal(deriveSellerId("owner", null), "owner");
  assert.equal(deriveSellerId("owner", undefined), "owner");
  assert.equal(deriveSellerId(null, "explicit"), "explicit");
  assert.equal(deriveSellerId(null, null), null);
  assert.equal(deriveSellerId(null, undefined), null);
  // empty explicit falls back to property owner
  assert.equal(deriveSellerId("owner", ""), "owner");
});

test("conversionDecision encodes idempotency: create once, then return-existing", () => {
  assert.equal(conversionDecision({ status: "accepted", deal_id: null }), "create");
  assert.equal(conversionDecision({ status: "accepted", deal_id: "d1" }), "return-existing");
  assert.equal(conversionDecision({ status: "submitted", deal_id: null }), "invalid");
  assert.equal(conversionDecision({ status: "draft", deal_id: null }), "invalid");
  assert.equal(conversionDecision({ status: "rejected", deal_id: null }), "invalid");
});

test("legacy offer safety: null links yield a valid decision and all-null input is accepted", () => {
  // A legacy accepted offer with no links can still be reasoned about deterministically.
  assert.equal(conversionDecision({ status: "accepted", deal_id: null }), "create");
  // createDraftOffer's input shape accepts an all-null/empty payload (no throw at the type level).
  const legacy: CreateOfferInput = {
    propertyId: null, buyerId: null, sellerId: null, matchId: null,
    amount: null, financing: null, conditions: null, includedItems: null,
    requestedEntryDate: null, expiresAt: null, note: null,
  };
  assert.equal(legacy.buyerId, null);
  assert.equal(legacy.propertyId, null);
  // seller derivation over the legacy (unlinked) shape is still well-defined
  assert.equal(deriveSellerId(null, legacy.sellerId ?? null), null);
});
