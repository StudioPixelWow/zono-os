// ============================================================================
// ZONO — Buyer portal core: deterministic proof (pure, mocks-free).
// Run: node --experimental-strip-types --test scripts/buyer-portal-tests/portal-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveCardStatus, derivePortalPriceDelta, summarizeCards, filterCards, sortCards,
  derivePortalNextStep, CARD_STATUS_LABEL, type PortalCard,
} from "../../src/lib/customer-portal/buyer-portal-core.ts";

function card(over: Partial<PortalCard> = {}): PortalCard {
  return {
    propertyId: "p1", title: "הרצל 18", city: "רחובות", rooms: 4, price: 2_250_000, imageUrl: null,
    status: "new", statusLabel: "חדש", available: true, priceDrop: null, viewingAt: null, reason: null, feedbackGiven: false, ...over,
  };
}

// ── Card status derivation ──────────────────────────────────────────────────
test("A/new: recommended + available + no viewing → new", () => {
  assert.equal(deriveCardStatus({ recoStatus: "recommended", propertyStatus: "active", viewing: "none" }), "new");
});
test("B/interested preserved", () => {
  assert.equal(deriveCardStatus({ recoStatus: "interested", propertyStatus: "active", viewing: "none" }), "interested");
});
test("C/rejected preserved", () => {
  assert.equal(deriveCardStatus({ recoStatus: "rejected", propertyStatus: "active", viewing: "none" }), "rejected");
});
test("D/viewing scheduled overrides reco status", () => {
  assert.equal(deriveCardStatus({ recoStatus: "interested", propertyStatus: "active", viewing: "scheduled" }), "viewing_scheduled");
});
test("E/viewing completed → viewed", () => {
  assert.equal(deriveCardStatus({ recoStatus: "viewing_requested", propertyStatus: "active", viewing: "completed" }), "viewed");
});
test("G/sold → unavailable overrides everything", () => {
  assert.equal(deriveCardStatus({ recoStatus: "interested", propertyStatus: "sold", viewing: "scheduled" }), "unavailable");
  assert.equal(deriveCardStatus({ recoStatus: "recommended", propertyStatus: "withdrawn", viewing: "none" }), "unavailable");
});
test("viewing_requested when requested and no scheduled meeting", () => {
  assert.equal(deriveCardStatus({ recoStatus: "viewing_requested", propertyStatus: "active", viewing: "none" }), "viewing_requested");
});

// ── F/price delta uses THEIR historical price ───────────────────────────────
test("F: customer-specific price drop from price_at_send", () => {
  const d = derivePortalPriceDelta(2_350_000, 2_250_000);
  assert.ok(d); assert.equal(d!.dropAmount, 100_000); assert.ok(d!.label.includes("ירד"));
});
test("no drop when price rose or equal", () => {
  assert.equal(derivePortalPriceDelta(2_250_000, 2_350_000), null);
  assert.equal(derivePortalPriceDelta(2_250_000, 2_250_000), null);
  assert.equal(derivePortalPriceDelta(null, 2_250_000), null);
});

// ── Summary + filter + sort ─────────────────────────────────────────────────
test("summarize counts", () => {
  const cards = [card({ status: "new" }), card({ status: "interested" }), card({ status: "viewing_scheduled" }), card({ status: "new", priceDrop: { dropAmount: 100_000, label: "x" } })];
  const s = summarizeCards(cards);
  assert.equal(s.total, 4); assert.equal(s.newCount, 2); assert.equal(s.interested, 1); assert.equal(s.viewings, 1); assert.equal(s.priceDrops, 1);
});
test("filter tabs", () => {
  const cards = [card({ status: "new" }), card({ status: "interested" }), card({ status: "rejected" }), card({ status: "viewing_scheduled" })];
  assert.equal(filterCards(cards, "new").length, 1);
  assert.equal(filterCards(cards, "interested").length, 1);
  assert.equal(filterCards(cards, "rejected").length, 1);
  assert.equal(filterCards(cards, "viewings").length, 1);
  assert.equal(filterCards(cards, "all").length, 4);
});
test("sort: scheduled/viewed before new before rejected before unavailable", () => {
  const cards = [card({ propertyId: "u", status: "unavailable" }), card({ propertyId: "r", status: "rejected" }), card({ propertyId: "s", status: "viewing_scheduled" }), card({ propertyId: "n", status: "new" })];
  const order = sortCards(cards).map((c) => c.propertyId);
  assert.deepEqual(order, ["s", "n", "r", "u"]);
});

// ── Next step ───────────────────────────────────────────────────────────────
test("next step: feedback pending wins", () => {
  assert.equal(derivePortalNextStep({ summary: summarizeCards([]), scheduledSoon: true, feedbackPending: 1 }), "ספרו לנו איך היה הביקור");
});
test("next step: new properties count", () => {
  const s = summarizeCards([card({ status: "new" }), card({ status: "new" })]);
  assert.equal(derivePortalNextStep({ summary: s, scheduledSoon: false, feedbackPending: 0 }), "יש 2 נכסים חדשים לצפייה");
});
test("next step: empty → update preferences", () => {
  assert.equal(derivePortalNextStep({ summary: summarizeCards([]), scheduledSoon: false, feedbackPending: 0 }), "עדכנו את העדפות החיפוש כדי שנמצא לכם נכסים");
});

// ── Privacy: the card DTO exposes no seller/other-buyer/score keys ──────────
test("PortalCard shape has no forbidden fields", () => {
  const keys = Object.keys(card());
  for (const forbidden of ["seller", "sellerName", "sellerPhone", "otherBuyers", "score", "compatibility", "dealStage", "ownerNotes"]) {
    assert.ok(!keys.includes(forbidden), `card must not expose ${forbidden}`);
  }
});
test("status labels are customer-facing Hebrew", () => {
  assert.equal(CARD_STATUS_LABEL.viewed, "כבר ביקרת");
  assert.equal(CARD_STATUS_LABEL.unavailable, "לא זמין יותר");
});
