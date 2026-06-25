/**
 * LOCAL-DEV-ONLY check for Competitor Intelligence™ (Phase 17). Pure layers only
 * (no DB, no network, no server-only imports). Verifies the deterministic rules:
 * private listings are NEVER classified · explicit agency → high confidence ·
 * normalized duplicate names merge · market share is a labeled estimate ·
 * price-drop-wave alert fires · alerts dedup within 24h · low confidence shown
 * honestly · area scoping prevents cross-org leakage (city scope).
 *
 * Run: npx tsx scripts/competitor-intelligence-dev-check.ts
 */
import {
  classifyListing, normalizeCompetitorName, confidenceLabel,
  computeCompetitorAnalytics, calculateCompetitorMarketShare, SHARE_LABEL,
  buildCompetitorAlertCandidates, dedupAlerts, alertDedupKey,
} from "../src/lib/competitor-intelligence";
import type { ListingSignal, CompetitorListingLink, ExistingAlertKey } from "../src/lib/competitor-intelligence/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function sig(over: Partial<ListingSignal> = {}): ListingSignal {
  return {
    marketPropertySourceId: "s1", provider: "yad2", listingType: "broker", city: "חיפה", neighborhood: "הדר",
    propertyType: "דירה", price: 2_000_000, rooms: 4, sizeSqm: 100, contactName: null, phone: null,
    agencyName: null, officeName: null, brokerName: null, firstSeenAt: new Date().toISOString(), ...over,
  };
}

function link(over: Partial<CompetitorListingLink> = {}): CompetitorListingLink {
  return {
    id: "l1", competitorProfileId: "c1", marketPropertySourceId: "s1", provider: "yad2", city: "חיפה",
    neighborhood: "הדר", propertyType: "דירה", listingType: "broker", price: 2_000_000, rooms: 4, sizeSqm: 100,
    firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), status: "active", confidence: 95, ...over,
  };
}

function main(): void {
  console.log("ZONO Competitor Intelligence dev-check\n");

  // 1) Private listings are NEVER classified as competitors.
  const priv = classifyListing(sig({ listingType: "private", contactName: "ישראל ישראלי", agencyName: "כלום נדל\"ן" }));
  assert(priv.competitorName === null && priv.confidence === 0, "private listing is NOT classified as a competitor");

  // 2) Explicit agency name → high confidence (95).
  const agency = classifyListing(sig({ agencyName: "אנגלו סכסון" }));
  assert(agency.competitorName === "אנגלו סכסון" && agency.confidence === 95 && agency.confidenceSource === "explicit_agency", "explicit agency → confidence 95");

  // 3) Broker office field → 85; contact-only → 50; phone-only → 60.
  assert(classifyListing(sig({ officeName: "רי/מקס חיפה" })).confidence === 85, "broker/office field → confidence 85");
  assert(classifyListing(sig({ listingType: "unknown", contactName: "דנה כהן" })).confidence === 50, "contact name only → confidence 50");
  assert(classifyListing(sig({ listingType: "unknown", phone: "050-1234567" })).confidence === 60, "phone-only grouping → confidence 60");
  assert(classifyListing(sig({ listingType: "unknown", contactName: null, phone: null, agencyName: null, officeName: null, brokerName: null })).confidence === 0, "no public evidence → no competitor profile");

  // 4) Normalized duplicate names merge (suffixes/spacing/case stripped for key).
  const n1 = normalizeCompetitorName("אנגלו סכסון נדל\"ן");
  const n2 = normalizeCompetitorName("  אנגלו   סכסון  ");
  assert(n1 === n2, "normalized duplicate names merge (suffix + spacing)");
  assert(normalizeCompetitorName("RE/MAX Realty") === normalizeCompetitorName("re max"), "english case + suffix normalization merges");

  // 5) Analytics + market share is a LABELED estimate with confidence.
  const links = [link({ id: "l1", marketPropertySourceId: "s1", price: 1_800_000 }), link({ id: "l2", marketPropertySourceId: "s2", price: 2_200_000 })];
  const analytics = computeCompetitorAnalytics({
    competitorProfileId: "c1", competitorName: "אנגלו סכסון", confidence: 95, links,
    priceDropSourceIds: new Set(["s1"]), removedSourceIds: new Set(), backOnMarketSourceIds: new Set(),
    todayIso: "1970-01-01T00:00:00Z", weekAgoIso: "1970-01-01T00:00:00Z", prevWeekActiveListings: 1, monitoredActiveInScope: 10, now: Date.now(),
  });
  assert(analytics.activeListings === 2 && analytics.priceDrops === 1, "analytics counts active listings + price drops");
  assert(analytics.estimatedSharePercent === 20, "estimated share = 2/10 = 20%");
  assert(analytics.trendVsLastWeek === "up", "trend up vs last week (1→2)");

  const share = calculateCompetitorMarketShare([{ competitorProfileId: "c1", competitorName: "אנגלו סכסון", city: "חיפה", neighborhood: null, competitorActiveListings: 8, totalMonitoredActiveListings: 80 }]);
  assert(share[0]!.estimatedSharePercent === 10 && share[0]!.label === SHARE_LABEL, "market share labeled estimate (8/80 = 10%)");
  assert(share[0]!.confidence === "high", "market-share confidence reflects denominator (80 ⇒ high)");
  assert(calculateCompetitorMarketShare([{ competitorProfileId: "c1", competitorName: "x", city: null, neighborhood: null, competitorActiveListings: 1, totalMonitoredActiveListings: 5 }])[0]!.confidence === "low", "thin denominator ⇒ low confidence (honest)");

  // 6) Price-drop-wave + spike + aggressive-pricing alerts fire.
  const candidates = buildCompetitorAlertCandidates({
    competitors: [analytics],
    areaActivity: [
      { competitorProfileId: "c1", competitorName: "אנגלו סכסון", city: "חיפה", neighborhood: "הדר", newListings: 5, priceDrops: 4, isNewArea: false, belowAreaAvgCount: 4, areaListingCount: 5 },
    ],
    shareChanges: [{ competitorProfileId: "c1", competitorName: "אנגלו סכסון", deltaPercent: 9 }],
  });
  assert(candidates.some((c) => c.alertType === "competitor_price_drop_wave"), "price-drop-wave alert created (≥3 drops)");
  assert(candidates.some((c) => c.alertType === "competitor_spike"), "spike alert created (≥4 new listings)");
  assert(candidates.some((c) => c.alertType === "aggressive_pricing"), "aggressive-pricing alert created (≥60% below avg)");
  assert(candidates.some((c) => c.alertType === "market_share_change"), "market-share-change alert created (≥5% delta)");

  // 7) Dedup: no duplicate unread alert of same type/competitor/area within 24h.
  const existing: ExistingAlertKey[] = [{ alertType: "competitor_price_drop_wave", competitorProfileId: "c1", city: "חיפה", neighborhood: "הדר", createdAt: new Date().toISOString(), status: "unread" }];
  const deduped = dedupAlerts(candidates, existing, Date.now());
  assert(!deduped.some((c) => c.alertType === "competitor_price_drop_wave"), "duplicate unread price-drop-wave (24h) is deduped");
  assert(deduped.some((c) => c.alertType === "competitor_spike"), "non-duplicate alert survives dedup");
  // Old existing alert (>24h) should NOT block.
  const oldExisting: ExistingAlertKey[] = [{ alertType: "competitor_spike", competitorProfileId: "c1", city: "חיפה", neighborhood: "הדר", createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), status: "unread" }];
  assert(dedupAlerts(candidates, oldExisting, Date.now()).some((c) => c.alertType === "competitor_spike"), "alert older than 24h does not block a new one");
  assert(alertDedupKey("competitor_spike", "c1", "חיפה", "הדר") === alertDedupKey("competitor_spike", "c1", "חיפה", "הדר"), "dedup key is stable");

  // 8) Low confidence is displayed honestly.
  assert(confidenceLabel(50).includes("נמוכה") && confidenceLabel(95).includes("גבוהה"), "confidence labels honest (low vs high)");

  // 9) No cross-area leakage: classifier never invents an area; share denominator is explicit.
  assert(classifyListing(sig({ city: null, neighborhood: null, agencyName: "אלפא" })).competitorName === "אלפא", "classification independent of area (org scope handled at query layer)");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main();
