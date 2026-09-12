import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePair, blockingKeys, pickCanonical, dedupeWithinBlocks, type DedupListing } from "../../src/lib/external-listings/dedup-core.ts";

const base = (o: Partial<DedupListing>): DedupListing => ({
  id: o.id ?? "x", source: o.source ?? "yad2", city: o.city ?? "Kiryat Bialik", neighborhood: null,
  street: o.street ?? null, streetNumber: o.streetNumber ?? null, rooms: o.rooms ?? null, sqm: o.sqm ?? null,
  floor: o.floor ?? null, price: o.price ?? null, propertyType: o.propertyType ?? "דירה",
  contactPhone: o.contactPhone ?? null, lat: o.lat ?? null, lng: o.lng ?? null,
  imageCount: o.imageCount ?? 0, hasAddress: o.hasAddress ?? false, firstSeenMs: o.firstSeenMs ?? null,
});

test("same property across sources scores HIGH", () => {
  const a = base({ id: "a", source: "yad2", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100, floor: 2, price: 2000000 });
  const b = base({ id: "b", source: "madlan", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 101, floor: 2, price: 2000000 });
  assert.equal(scorePair(a, b).level, "high");
});
test("same street+geo+rooms+price but no house number still groups (Yad2/Madlan reality)", () => {
  const a = base({ id: "a", source: "yad2", street: "ויצמן", rooms: 3, sqm: 80, price: 1500000, lat: 32.83, lng: 35.08 });
  const b = base({ id: "b", source: "madlan", street: "ויצמן", rooms: 3, sqm: 81, price: 1510000, lat: 32.8301, lng: 35.0801 });
  assert.equal(scorePair(a, b).level, "high");
});
test("different cities never group", () => {
  const a = base({ id: "a", city: "Kiryat Bialik", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100 });
  const b = base({ id: "b", city: "Rehovot", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100 });
  assert.equal(scorePair(a, b).level, "none");
});
test("conflicting rooms/size is NOT auto-grouped (false-positive guard)", () => {
  const a = base({ id: "a", source: "yad2", street: "הרצל", streetNumber: "10", rooms: 2, sqm: 55, price: 1200000 });
  const b = base({ id: "b", source: "madlan", street: "הרצל", streetNumber: "10", rooms: 5, sqm: 140, price: 1200000 });
  assert.notEqual(scorePair(a, b).level, "high");
});
test("different property type never HIGH", () => {
  const a = base({ id: "a", source: "yad2", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100, propertyType: "דירה" });
  const b = base({ id: "b", source: "madlan", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100, propertyType: "מגרש" });
  assert.notEqual(scorePair(a, b).level, "high");
});
test("canonical = richest (address + more images + geo)", () => {
  const thin = base({ id: "thin", imageCount: 1 });
  const rich = base({ id: "rich", hasAddress: true, imageCount: 6, lat: 32.8, lng: 35.0, price: 100 });
  assert.equal(pickCanonical([thin, rich]).id, "rich");
});
test("blocking keys bucket by street / geo / attributes", () => {
  const keys = blockingKeys(base({ street: "הרצל", rooms: 4, sqm: 100, lat: 32.8, lng: 35.0 }));
  assert.ok(keys.some((k) => k.startsWith("s:")), "street key");
  assert.ok(keys.some((k) => k.startsWith("g:")), "geo key");
  assert.ok(keys.some((k) => k.startsWith("a:")), "attribute key");
});
test("dedupeWithinBlocks groups cross-source twins and leaves unrelated apart", () => {
  const listings: DedupListing[] = [
    base({ id: "y1", source: "yad2", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100, price: 2000000 }),
    base({ id: "m1", source: "madlan", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100, price: 2000000 }),
    base({ id: "y2", source: "yad2", street: "ביאליק", streetNumber: "3", rooms: 2, sqm: 55, price: 1200000 }),
  ];
  const res = dedupeWithinBlocks(listings);
  assert.equal(res.stats.groups, 1);
  const g = res.groups[0];
  assert.deepEqual([...g.memberIds].sort(), ["m1", "y1"]);
  assert.equal(res.stats.ungrouped, 1); // y2 stays alone
});
test("two rows from the SAME source are not grouped here (handled upstream)", () => {
  const listings: DedupListing[] = [
    base({ id: "a", source: "yad2", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100, price: 2000000 }),
    base({ id: "b", source: "yad2", street: "הרצל", streetNumber: "10", rooms: 4, sqm: 100, price: 2000000 }),
  ];
  assert.equal(dedupeWithinBlocks(listings).stats.groups, 0);
});
