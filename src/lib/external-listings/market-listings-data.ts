// ============================================================================
// 🌍 Market Listings data loader (server-only) — Phase 26.7.2.
// ----------------------------------------------------------------------------
// Single shared fetch for the external Market Listings surface so the workspace
// landing (/market-intelligence) and the dedicated listings page
// (/market-intelligence/listings) reuse ONE data source. No new business logic,
// no new repository — this only composes the EXISTING external-listings
// repository + buyer-match enrichment. Defensive: never throws to the page.
// ============================================================================
import "server-only";
import { externalListingRepository, type ExternalListingRow } from "@/lib/external-listings/repository";
import { enrichListingsBuyerMatches, type ListingMatchSummary } from "@/lib/external-listings/service";
import { getCurrentPlatformOperator } from "@/lib/platform-admin/server/auth";

export interface MarketListingsData {
  listings: ExternalListingRow[];
  marketStats: { priceDrops: number; duplicateCandidates: number };
  isAdmin: boolean;
  matches: Record<string, ListingMatchSummary>;
}

export async function loadMarketListings(): Promise<MarketListingsData> {
  let listings: ExternalListingRow[] = [];
  let marketStats = { priceDrops: 0, duplicateCandidates: 0 };
  let isAdmin = false;
  let matches: Record<string, ListingMatchSummary> = {};
  try {
    // P9.1 — "isAdmin" gates the MANUAL scan / import / debug tooling on the
    // market-listings surface. It must mean ZONO PLATFORM STAFF, not an office
    // manager: a customer (even the office owner) never triggers scans manually —
    // their city is scanned automatically and they only see their own listings.
    // Previously this was has_min_role("manager"), which leaked staff tooling to
    // every office owner. Now it resolves to a real platform operator.
    const [listingsRes, statsRes, operator] = await Promise.all([
      externalListingRepository.listForOrg(),
      externalListingRepository.marketStats(),
      getCurrentPlatformOperator().catch(() => null),
    ]);
    listings = listingsRes;
    marketStats = statsRes;
    isAdmin = operator !== null;
    try {
      matches = await enrichListingsBuyerMatches(listings.map((l) => ({
        id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood, price: l.price,
        sqm: l.sqm ?? l.area_sqm, rooms: l.rooms, has_agent: l.has_agent, opportunity_score: l.opportunity_score,
      })));
    } catch (e) { console.error("[market-listings] enrich failed:", e); }
  } catch (e) {
    console.error("[market-listings] list failed:", e);
  }
  return { listings, marketStats, isAdmin, matches };
}
