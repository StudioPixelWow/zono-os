import { listProperties, type PropertyRow } from "@/lib/properties/repository";
import { externalListingRepository, type ExternalListingRow } from "@/lib/external-listings/repository";
import { getSessionContext } from "@/lib/auth/session";
import { getDashboardDict } from "@/lib/dashboard-home/i18n";
import { buildDashboardHomeData } from "@/lib/dashboard-home/data";
import { getAcquisitionBoard } from "@/lib/acquisition/service";
import { getCompetitorBoard } from "@/lib/competitor/service";
import { DashboardHomeView } from "@/components/dashboard-home/DashboardHomeView";
import type { ExclusiveDeal, CompetitorThreat } from "@/components/dashboard-home/components/ReferenceSections";

// Reads live data on the server (properties woven into the command center).
export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await getSessionContext();
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "סוכן";
  const cityName = profile?.primary_city ?? undefined;

  let properties: PropertyRow[] = [];
  try {
    properties = await listProperties({});
  } catch (e) {
    console.error("[home] properties failed:", e);
  }

  // Recommended property = a ROTATING private-owner external opportunity (no
  // agent). force-dynamic + random pick → a different one on each visit.
  let featuredExternal: ExternalListingRow | null = null;
  try {
    featuredExternal = await externalListingRepository.randomPrivateOpportunity();
  } catch (e) {
    console.error("[home] private opportunity failed:", e);
  }

  // "עסקאות שאסור לפספס" — private-seller external opportunities only.
  let exclusiveDeals: ExclusiveDeal[] = [];
  try {
    const cards = await getAcquisitionBoard();
    exclusiveDeals = cards
      .filter((c) => c.sourceType?.startsWith("private") || (c.privateSellerScore ?? 0) >= 60)
      .slice(0, 12)
      .map((c) => ({
        id: c.listingId,
        title: c.title ?? "נכס",
        city: c.city,
        neighborhood: null,
        price: c.price,
        rooms: c.rooms,
        sqm: c.sqm,
        image: c.images?.[0] ?? null,
        listingUrl: c.listingUrl,
        contactName: c.contactName,
        contactPhone: c.contactPhone,
      }));
  } catch (e) {
    console.error("[home] acquisition board failed:", e);
  }

  // "מי מאיים עליך כרגע?" — competitors ranked by threat (share + growth).
  let threats: CompetitorThreat[] = [];
  try {
    const board = await getCompetitorBoard();
    threats = board.competitors
      .map((c) => ({
        id: c.id,
        name: c.display_name,
        type: c.competitor_type,
        threat: Math.round(0.5 * c.market_share_score + 0.5 * c.growth_score),
        marketShare: Math.round(c.market_share_score),
        growth: Math.round(c.growth_score),
        listings: c.total_listings,
        localities: c.active_localities,
      }))
      .sort((a, b) => b.threat - a.threat)
      .slice(0, 6);
  } catch (e) {
    console.error("[home] competitor board failed:", e);
  }

  const dict = getDashboardDict("he");
  const data = buildDashboardHomeData({ agentName, cityName, realProperties: properties, featuredExternal });

  return <DashboardHomeView dict={dict} data={data} exclusiveDeals={exclusiveDeals} threats={threats} />;
}
