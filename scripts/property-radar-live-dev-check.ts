/**
 * LOCAL-DEV-ONLY check for the Live Command Center logic (Phase 13).
 *
 * Tests the pure helpers shared by the /property-radar UI (no React/DB needed):
 * filters, global search, timeline ordering, list windowing (virtualization),
 * realtime merge-by-id, and the REAL-coordinate map rule (no fake pins).
 *
 * Run: npx tsx scripts/property-radar-live-dev-check.ts
 */
import { filterFeed, windowItems, mergeFeedById, sortTimelineEntries, extractCoord } from "../src/lib/property-radar/live/filter";
import type { LiveFeedItem, PropertyTimelineEntryDTO } from "../src/lib/property-radar/live/types";

function item(over: Partial<LiveFeedItem>): LiveFeedItem {
  return {
    id: over.id ?? "i1", kind: over.kind ?? "new_property", at: over.at ?? new Date().toISOString(),
    marketPropertySourceId: over.marketPropertySourceId ?? "s1", listingType: over.listingType ?? "private",
    city: over.city ?? "חיפה", neighborhood: over.neighborhood ?? null, addressText: over.addressText ?? "הרצל 1, חיפה",
    price: over.price ?? 2_000_000, priceDelta: over.priceDelta ?? null, imageUrl: null, externalUrl: null,
    phone: over.phone ?? "050-1234567", opportunityScore: over.opportunityScore ?? 70, buyerMatchCount: over.buyerMatchCount ?? 0,
    provider: over.provider ?? "yad2",
  };
}

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("Property Radar™ Live command center dev-check\n");
  const now = Date.parse("2026-06-25T12:00:00Z");
  const feed: LiveFeedItem[] = [
    item({ id: "a", kind: "hot_deal", listingType: "private", opportunityScore: 95, at: new Date(now - 3600_000).toISOString(), city: "חיפה" }),
    item({ id: "b", kind: "price_drop", listingType: "broker", opportunityScore: 60, at: new Date(now - 2 * 3600_000).toISOString(), city: "תל אביב", phone: "0529998888" }),
    item({ id: "c", kind: "new_property", listingType: "private", opportunityScore: 40, at: new Date(now - 5 * 24 * 3600_000).toISOString(), city: "רעננה" }),
    item({ id: "d", kind: "back_on_market", listingType: "project", opportunityScore: 85, at: new Date(now - 30 * 60_000).toISOString() }),
  ];

  // 1) Filter: kind chip.
  const onlyHot = filterFeed(feed, { windowMs: Infinity, kinds: new Set(["hot_deal"]), highOnly: false, query: "" }, now);
  assert(onlyHot.length === 1 && onlyHot[0]!.id === "a", "kind filter keeps only matching events");

  // 2) Filter: listing type chip.
  const onlyPrivate = filterFeed(feed, { windowMs: Infinity, kinds: new Set(["private"]), highOnly: false, query: "" }, now);
  assert(onlyPrivate.length === 2 && onlyPrivate.every((i) => i.listingType === "private"), "listing-type filter (private) works");

  // 3) Filter: time window (24h drops the 5-day-old item).
  const last24 = filterFeed(feed, { windowMs: 24 * 3600_000, kinds: new Set(), highOnly: false, query: "" }, now);
  assert(last24.length === 3 && !last24.some((i) => i.id === "c"), "time-window filter (24h) excludes old events");

  // 4) Filter: high score only (≥80).
  const high = filterFeed(feed, { windowMs: Infinity, kinds: new Set(), highOnly: true, query: "" }, now);
  assert(high.length === 2 && high.every((i) => (i.opportunityScore ?? 0) >= 80), "high-score-only filter works");

  // 5) Search: by city / phone / provider.
  assert(filterFeed(feed, { windowMs: Infinity, kinds: new Set(), highOnly: false, query: "תל אביב" }, now).length === 1, "search by city");
  assert(filterFeed(feed, { windowMs: Infinity, kinds: new Set(), highOnly: false, query: "0529998888" }, now).length === 1, "search by phone");
  assert(filterFeed(feed, { windowMs: Infinity, kinds: new Set(), highOnly: false, query: "yad2" }, now).length === feed.length, "search by provider");

  // 6) Virtualization: windowItems caps + reports more.
  const big = Array.from({ length: 50 }, (_, i) => item({ id: `w${i}` }));
  const win = windowItems(big, 20);
  assert(win.items.length === 20 && win.hasMore, "windowItems caps to 20 and flags hasMore");
  assert(!windowItems(big.slice(0, 10), 20).hasMore, "windowItems: no more when list fits");

  // 7) Realtime merge-by-id: dedup + newest first.
  const merged = mergeFeedById(
    [item({ id: "x", at: new Date(now - 10_000).toISOString() })],
    [item({ id: "x", at: new Date(now).toISOString() }), item({ id: "y", at: new Date(now - 5_000).toISOString() })],
  );
  assert(merged.length === 2, "merge dedups by id");
  assert(merged[0]!.id === "x" && merged[1]!.id === "y", "merge sorts newest first");

  // 8) Timeline ordering (ascending).
  const entries: PropertyTimelineEntryDTO[] = [
    { at: new Date(now).toISOString(), kind: "event", label: "ב" },
    { at: new Date(now - 86400_000).toISOString(), kind: "first_seen", label: "א" },
  ];
  const ordered = sortTimelineEntries(entries);
  assert(ordered[0]!.label === "א" && ordered[1]!.label === "ב", "timeline entries ordered chronologically");

  // 9) Map rule — REAL coordinates only (no fake pins).
  assert(extractCoord({ lat: 32.79, lng: 34.99 }) != null, "real coordinates accepted");
  assert(extractCoord({ latitude: "32.1", longitude: "34.8" }) != null, "string coordinates parsed");
  assert(extractCoord({ lat: 0, lng: 0 }) === null, "null-island (0,0) rejected — no fake pins");
  assert(extractCoord({ lat: 999, lng: 5 }) === null, "out-of-range coordinates rejected");
  assert(extractCoord({}) === null && extractCoord(null) === null, "missing coordinates rejected");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main();
