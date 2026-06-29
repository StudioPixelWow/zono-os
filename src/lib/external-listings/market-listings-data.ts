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
import { createClient } from "@/lib/supabase/server";

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
    const supabase = await createClient();
    const [listingsRes, statsRes, adminRes] = await Promise.all([
      externalListingRepository.listForOrg(),
      externalListingRepository.marketStats(),
      supabase.rpc("has_min_role", { p_min: "manager" }),
    ]);
    listings = listingsRes;
    marketStats = statsRes;
    isAdmin = adminRes.data === true;
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
