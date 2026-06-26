import { listProperties, listPropertyCovers, type PropertyRow } from "@/lib/properties/repository";
import { externalListingRepository, type ExternalListingRow } from "@/lib/external-listings/repository";
import { enrichListingsBuyerMatches, type ListingMatchSummary } from "@/lib/external-listings/service";
import { matchesInventoryTab, type InventoryTab } from "@/lib/properties/inventory";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { PropertyStatus, PropertyType } from "@/lib/supabase/types";
import { PropertiesListView } from "./PropertiesListView";
import { PropertiesOSView } from "./PropertiesOSView";
import { InventoryTabs } from "./InventoryTabs";
import { ExternalListingsView } from "./ExternalListingsView";

export const dynamic = "force-dynamic";
// The "Sync Now" button triggers the external-listings sync as a SERVER ACTION
// invoked from THIS page. In Next.js a server action's execution time is governed
// by the page segment it runs from — NOT by the API route's config. Without this,
// the long Apify scrape was killed on the default timeout, leaving the import job
// stuck "running" with 0 listings pulled. Give it the Node runtime + full budget
// (clamped to the plan max) so the sync can actually finish.
export const runtime = "nodejs";
export const maxDuration = 300;

type SearchParams = Record<string, string | string[] | undefined>;

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const filters = {
    city: str("city"),
    type: str("type") as PropertyType | undefined,
    status: str("status") as PropertyStatus | undefined,
    minPrice: num(str("minPrice")),
    maxPrice: num(str("maxPrice")),
    minRooms: num(str("minRooms")),
    maxRooms: num(str("maxRooms")),
  };

  const tab = (str("inv") ?? "all") as InventoryTab;
  const { user, profile } = await getSessionContext();
  const currentUserId = user?.id ?? null;
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "סוכן";

  let rows: PropertyRow[] = [];
  let error = false;
  try {
    rows = await listProperties(filters);
  } catch (e) {
    console.error("[properties] list failed:", e);
    error = true;
  }
  // Filter the internal inventory by the active tab (external handled separately).
  if (tab !== "external") rows = rows.filter((r) => matchesInventoryTab(r, tab, currentUserId));

  let externalListings: ExternalListingRow[] = [];
  let externalMarketStats = { priceDrops: 0, duplicateCandidates: 0 };
  let externalIsAdmin = false;
  let externalMatches: Record<string, ListingMatchSummary> = {};
  if (tab === "external") {
    try {
      const supabase = await createClient();
      const [listingsRes, statsRes, adminRes] = await Promise.all([
        externalListingRepository.listForOrg(),
        externalListingRepository.marketStats(),
        supabase.rpc("has_min_role", { p_min: "manager" }),
      ]);
      externalListings = listingsRes;
      externalMarketStats = statsRes;
      externalIsAdmin = adminRes.data === true;
      try { externalMatches = await enrichListingsBuyerMatches(externalListings.map((l) => ({ id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood, price: l.price, sqm: l.sqm ?? l.area_sqm, rooms: l.rooms, has_agent: l.has_agent, opportunity_score: l.opportunity_score }))); }
      catch (e) { console.error("[external] enrich failed:", e); }
    } catch (e) {
      console.error("[external] list failed:", e);
    }
  }

  let covers: Record<string, string> = {};
  try { covers = await listPropertyCovers(rows.map((r) => r.id)); } catch (e) { console.error("[properties] covers failed:", e); }

  return (
    <PropertiesOSView properties={rows} agentName={agentName} covers={covers}>
      <div className="flex flex-col gap-6">
        <InventoryTabs active={tab} />
        {tab === "external" ? (
          <ExternalListingsView listings={externalListings} marketStats={externalMarketStats} isAdmin={externalIsAdmin} matches={externalMatches} />
        ) : (
          <PropertiesListView properties={rows} filters={filters} error={error} currentUserId={currentUserId} covers={covers} />
        )}
      </div>
    </PropertiesOSView>
  );
}
