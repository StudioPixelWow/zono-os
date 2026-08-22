// ============================================================================
// ZONO AVM 3.2 — canonical address builder + resolution model (pure, offline).
// Proves a CITY centroid is never treated as precise, precise coords aren't
// downgraded, and the query hierarchy picks the finest available address.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/avm-geo-address.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGeoQuery, resolveGeoResolution, isPreciseResolution, resolutionRank, shouldReplaceCoordinate,
} from "../../src/lib/geo/address.ts";

test("query hierarchy: street+number → ROOFTOP-capable; city only → CITY", () => {
  assert.equal(buildGeoQuery({ street: "יקינתון 5", city: "קריית ביאליק", neighborhood: "גבעת הרקפות" }).maxResolution, "ROOFTOP");
  assert.equal(buildGeoQuery({ neighborhood: "גבעת הרקפות", city: "קריית ביאליק" }).maxResolution, "NEIGHBORHOOD");
  assert.equal(buildGeoQuery({ city: "קריית ביאליק" }).maxResolution, "CITY");
  assert.equal(buildGeoQuery({}).maxResolution, "UNRESOLVED");
});

test("street parsing splits 'לוטם 2.0' into name + number", () => {
  const q = buildGeoQuery({ street: "לוטם 2.0", city: "קריית ביאליק" });
  assert.equal(q.street, "לוטם");
  assert.equal(q.streetNumber, "2");
});

test("property title is NEVER used as a geocoding address (caused ZERO_RESULTS)", () => {
  const q = buildGeoQuery({ city: "קרית ביאליק", neighborhood: "רמות", buildingNumber: "5", title: "דירת 4 חדרים משופצת" });
  assert.equal(q.address, null);            // title ignored
  assert.equal(q.street, null);
  assert.equal(q.streetNumber, null);       // bare building number without a street is dropped
  assert.equal(q.maxResolution, "NEIGHBORHOOD"); // geocodes by neighborhood+city, honestly coarse
});

test("resolution never exceeds what the address supports", () => {
  // provider says ROOFTOP but address is only city → capped at CITY
  assert.equal(resolveGeoResolution("CITY", 1.0), "CITY");
  // address supports ROOFTOP but provider is approximate → follows provider
  assert.equal(resolveGeoResolution("ROOFTOP", 0.4), "CITY");
  assert.equal(resolveGeoResolution("ROOFTOP", 0.95), "ROOFTOP");
});

test("distance tiers require STREET-or-better precision", () => {
  assert.ok(isPreciseResolution("ROOFTOP"));
  assert.ok(isPreciseResolution("STREET"));
  assert.ok(!isPreciseResolution("NEIGHBORHOOD"));
  assert.ok(!isPreciseResolution("CITY"));
  assert.ok(!isPreciseResolution(null));
});

test("a coarse result never overwrites a precise coordinate", () => {
  assert.ok(!shouldReplaceCoordinate("ROOFTOP", "CITY"));
  assert.ok(!shouldReplaceCoordinate("STREET", "NEIGHBORHOOD"));
  assert.ok(shouldReplaceCoordinate("CITY", "STREET"));
  assert.ok(shouldReplaceCoordinate(null, "NEIGHBORHOOD"));
  assert.ok(shouldReplaceCoordinate("UNRESOLVED", "CITY"));
});

test("resolution rank ordering", () => {
  assert.ok(resolutionRank("ROOFTOP") > resolutionRank("STREET"));
  assert.ok(resolutionRank("STREET") > resolutionRank("NEIGHBORHOOD"));
  assert.ok(resolutionRank("NEIGHBORHOOD") > resolutionRank("CITY"));
  assert.ok(resolutionRank("CITY") > resolutionRank("UNRESOLVED"));
});
