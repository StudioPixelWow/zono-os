// ============================================================================
// 🛒 ZONO — Marketplace Intelligence — offline self-check (pure). PHASE 58.0.
// Spec QA: new external listing, duplicate listing, no source link, internal
// routing, buyer match, acquisition alert, no direct external primary click,
// no scraping (compliance registry).
// ============================================================================
import { internalRoute, detectDuplicate, priceAnomaly, classifyOpportunity, marketHealthByArea } from "./classify";
import { sourceInfo, SOURCE_REGISTRY } from "./registry";
import type { MarketListing } from "./types";

function listing(over: Partial<MarketListing> = {}): MarketListing {
  return {
    id: "l1", source: "yad2", city: "תל אביב", neighborhood: "לב העיר", address: "רחוב הרצל 1",
    propertyType: "apartment", price: 2_000_000, rooms: 3, sqm: 80, listingUrl: "https://www.yad2.co.il/item/1",
    status: "active", opportunityScore: 60, duplicateGroupId: null, primaryPropertyId: null, promotedPropertyId: null,
    listingSourceType: "broker", firstSeenAt: "2026-07-01T00:00:00.000Z", ...over,
  };
}

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  const groups = new Map<string, number>();

  // 1. New external listing → classified as an opportunity.
  const l1 = listing({ opportunityScore: 75, listingSourceType: "by_owner" });
  const dup1 = detectDuplicate(l1, groups);
  const op1 = classifyOpportunity(l1, dup1, priceAnomaly(l1, null), 0);
  add("new listing: classified opportunity", !!op1 && op1.kind === "acquisition" && op1.duplicate.kind === "unique");

  // 2. Duplicate listing (in inventory) → not surfaced as a new opportunity.
  const l2 = listing({ primaryPropertyId: "prop-9" });
  const dup2 = detectDuplicate(l2, groups);
  add("duplicate in inventory: detected + no new opportunity", dup2.kind === "in_inventory" && classifyOpportunity(l2, dup2, priceAnomaly(l2, null), 0) === null);

  // 2b. Cross-source duplicate.
  const g = new Map<string, number>([["grp-1", 2]]);
  add("duplicate cross-source: detected", detectDuplicate(listing({ duplicateGroupId: "grp-1" }), g).kind === "cross_source");

  // 3. No source link → external is null but primary is still internal.
  const l3 = listing({ listingUrl: null });
  const r3 = internalRoute(l3);
  add("no source link: external null, primary internal", r3.external === null && r3.primaryHref.startsWith("/"));

  // 4. Internal routing first — matched listing routes to internal property.
  const r4 = internalRoute(listing({ promotedPropertyId: "prop-5" }));
  add("internal routing: primary = internal property", r4.primaryHref === "/properties/prop-5" && r4.isInternalMatch);

  // 5. Buyer match opportunity.
  const l5 = listing({ opportunityScore: 40, listingSourceType: "broker" });
  const op5 = classifyOpportunity(l5, detectDuplicate(l5, groups), priceAnomaly(l5, null), 3);
  add("buyer match: classified buyer_match", !!op5 && op5.kind === "buyer_match" && op5.buyerMatches === 3);

  // 6. Acquisition alert — underpriced listing → acquisition + approval-gated.
  const l6 = listing({ price: 1_400_000, sqm: 100 });   // 14k/sqm vs 25k median → underpriced
  const an6 = priceAnomaly(l6, 25_000);
  const op6 = classifyOpportunity(l6, detectDuplicate(l6, groups), an6, 0);
  add("acquisition: underpriced → acquisition opportunity", an6.kind === "underpriced" && an6.isOpportunity && !!op6 && op6.kind === "acquisition" && op6.requiresApproval === true);

  // 7. No direct external primary click — primary href is NEVER an external URL.
  const listings = [listing(), listing({ id: "l2", listingUrl: "https://madlan.co.il/x" }), listing({ id: "l3", primaryPropertyId: "p1" })];
  add("no external primary: every primary href is internal", listings.every((l) => !/^https?:\/\//i.test(internalRoute(l).primaryHref)));

  // 8. No scraping — registry marks facebook_marketplace planning-only + every source scrapeForbidden.
  add("no scraping: facebook planning_only + not allowed for import", sourceInfo("facebook_marketplace").compliance === "planning_only" && sourceInfo("facebook_marketplace").allowed === false);
  add("no scraping: every registered source flagged scrapeForbidden", SOURCE_REGISTRY.every((s) => s.scrapeForbidden === true));
  add("unknown source: not allowed until reviewed", sourceInfo("randomsite").allowed === false && sourceInfo("randomsite").compliance === "unknown");

  // 9. Market health by area.
  const many = Array.from({ length: 22 }, (_, i) => listing({ id: `h${i}`, city: "חיפה", price: 1_800_000 + i * 1000, sqm: 90 }));
  const health = marketHealthByArea(many);
  add("market health: area aggregated with supply band", health.length === 1 && health[0].listings === 22 && health[0].supply === "high" && health[0].band === "soft");

  // 10. Overpriced detection.
  add("price anomaly: overpriced detected", priceAnomaly(listing({ price: 3_500_000, sqm: 100 }), 25_000).kind === "overpriced");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
