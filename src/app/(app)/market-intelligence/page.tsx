// ============================================================================
// 🌍 מודיעין שוק — Market Intelligence workspace (external market ONLY).
// ----------------------------------------------------------------------------
// A COMPLETELY separate application section — this is NOT CRM. It surfaces the
// external market: external listings, new listings, price reductions, market
// acceptance/exit, off-market, and links into Property Radar / Heatmap / Market
// trends / AI insights. Reuses the existing ExternalListingsView + external
// repository. Never mixes with personal or office inventory. Presentation only.
// ============================================================================
import { externalListingRepository, type ExternalListingRow } from "@/lib/external-listings/repository";
import { enrichListingsBuyerMatches, type ListingMatchSummary } from "@/lib/external-listings/service";
import { createClient } from "@/lib/supabase/server";
import { ExternalListingsView } from "../properties/ExternalListingsView";
import { WorkspaceHeader, WorkspaceLinks, type WorkspaceLink } from "@/components/workspace/WorkspaceHeader";

export const dynamic = "force-dynamic";
// ExternalListingsView's "Sync Now" runs as a server action from THIS page, so
// it needs the Node runtime + full duration budget (same as the legacy page).
export const runtime = "nodejs";
export const maxDuration = 300;

const MARKET_LINKS: WorkspaceLink[] = [
  { href: "/market-intelligence/dashboard", emoji: "📊", label: "דשבורד שוק", hint: "Market Dashboard" },
  { href: "/intelligence-explorer", emoji: "🔎", label: "חיפוש מודיעין", hint: "Intelligence Explorer" },
  { href: "/property-radar", emoji: "📡", label: "רדאר נכסים — חי", hint: "Property Radar" },
  { href: "/market", emoji: "🔥", label: "מפת חום שוק", hint: "Heatmap" },
  { href: "/transactions", emoji: "🏛️", label: "עסקאות שוק", hint: "Market deals" },
  { href: "/competitor-intelligence", emoji: "🛡️", label: "מודיעין מתחרים", hint: "Competition" },
  { href: "/brokerage-data", emoji: "🏢", label: "דאטה משרדי תיווך", hint: "Brokerage Intelligence" },
  { href: "/market-intelligence/map", emoji: "🗺️", label: "מפת שוק חיה", hint: "Live Market Map" },
];

export default async function MarketIntelligencePage() {
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
    } catch (e) { console.error("[market-intelligence] enrich failed:", e); }
  } catch (e) {
    console.error("[market-intelligence] list failed:", e);
  }

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      <WorkspaceHeader
        emoji="🌍" scope="market" title="מודיעין שוק"
        subtitle="מרכז מודיעין שוק חיצוני — מודעות חדשות, ירידות מחיר, קליטה ויציאה מהשוק, אוף-מרקט, רדאר נכסים, מפת חום, מגמות ותובנות AI. זהו אינו CRM."
      />
      <WorkspaceLinks links={MARKET_LINKS} />
      <ExternalListingsView listings={listings} marketStats={marketStats} isAdmin={isAdmin} matches={matches} />
    </div>
  );
}
