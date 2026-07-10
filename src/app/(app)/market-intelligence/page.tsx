// ============================================================================
// 🌍 מודיעין שוק — Market Intelligence workspace (external market ONLY).
// ----------------------------------------------------------------------------
// A COMPLETELY separate application section — this is NOT CRM. It surfaces the
// external market: external listings, new listings, price reductions, market
// acceptance/exit, off-market, and links into Property Radar / Heatmap / Market
// trends / AI insights. Reuses the existing ExternalListingsView + external
// repository. Never mixes with personal or office inventory. Presentation only.
// ============================================================================
import { loadMarketListings } from "@/lib/external-listings/market-listings-data";
import { ExternalListingsView } from "../properties/ExternalListingsView";
import { WorkspaceHeader, WorkspaceLinks, type WorkspaceLink } from "@/components/workspace/WorkspaceHeader";
import { MarketIntelNav } from "@/components/market-intelligence/MarketIntelNav";
import { AcquisitionIntelligencePanel } from "@/components/broker-intelligence/AcquisitionIntelligencePanel";

export const dynamic = "force-dynamic";
// ExternalListingsView's "Sync Now" runs as a server action from THIS page, so
// it needs the Node runtime + full duration budget (same as the legacy page).
export const runtime = "nodejs";
export const maxDuration = 300;

const MARKET_LINKS: WorkspaceLink[] = [
  { href: "/market-intelligence/listings", emoji: "🌍", label: "מודעות שוק", hint: "Market Listings" },
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
  const { listings, marketStats, isAdmin, matches } = await loadMarketListings();

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      <WorkspaceHeader
        emoji="🌍" scope="market" title="מודיעין שוק"
        subtitle="מרכז מודיעין שוק חיצוני — מודעות חדשות, ירידות מחיר, קליטה ויציאה מהשוק, אוף-מרקט, רדאר נכסים, מפת חום, מגמות ותובנות AI. זהו אינו CRM."
      />
      <MarketIntelNav active="listings" crumbs={[{ label: "מודעות שוק", href: "/market-intelligence/listings" }]} />
      <WorkspaceLinks links={MARKET_LINKS} />
      <AcquisitionIntelligencePanel />
      <ExternalListingsView listings={listings} marketStats={marketStats} isAdmin={isAdmin} matches={matches} />
    </div>
  );
}
