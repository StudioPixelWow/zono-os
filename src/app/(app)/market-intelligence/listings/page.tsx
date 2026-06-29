// ============================================================================
// 🌍 /market-intelligence/listings — נכסי השוק. The DIRECT entry point to all
// external market listings (Phase 26.7.2 · framework-migrated 26.7.3/26.8).
// Navigation/presentation only. Reuses the EXISTING ExternalListingsView (which
// owns the real "סנכרן עכשיו" action) + the shared loadMarketListings() loader.
// No new data source, no business logic, no calculations. ?focus= only drives
// the breadcrumb + active tab; it never changes what is fetched.
// ============================================================================
import { loadMarketListings } from "@/lib/external-listings/market-listings-data";
import { ExternalListingsView } from "../../properties/ExternalListingsView";
import { MarketIntelNav, type Crumb } from "@/components/market-intelligence/MarketIntelNav";
import {
  IntelligencePage, IntelligenceHeader, IntelligenceActionBar, IntelligenceActionLink, IntelligenceEmptyState,
} from "@/components/intelligence/framework";

export const dynamic = "force-dynamic";
// ExternalListingsView's "Sync Now" runs as a server action from this page, so
// it needs the Node runtime + full duration budget (same as the landing page).
export const runtime = "nodejs";
export const maxDuration = 300;

const FOCUS: Record<string, { active: string; label: string; hint: string }> = {
  opportunities: { active: "opportunities", label: "הזדמנויות", hint: "ממוקד בהזדמנויות מובילות (AI Score גבוה) מתוך נכסי השוק." },
  "price-drops": { active: "price-drops", label: "ירידות מחיר", hint: "ממוקד בנכסים עם ירידות מחיר שזוהו בשוק." },
  "likely-exit": { active: "likely-exit", label: "Likely Market Exit", hint: "ממוקד בנכסים עם סבירות גבוהה ליציאה מהשוק." },
};

export default async function MarketListingsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const f = focus ? FOCUS[focus] : undefined;
  const { listings, marketStats, isAdmin, matches } = await loadMarketListings();

  const crumbs: Crumb[] = [{ label: "נכסי השוק", href: "/market-intelligence/listings" }];
  if (f) crumbs.push({ label: f.label });

  return (
    <IntelligencePage>
      <MarketIntelNav active={f?.active ?? "listings"} crumbs={crumbs} />

      <IntelligenceHeader
        emoji="🌍"
        eyebrow="MARKET LISTINGS"
        title="נכסי השוק"
        subtitle="כל הנכסים החיצוניים שנסרקו מיד2, מדלן ומקורות שוק נוספים."
        actions={
          <IntelligenceActionBar>
            <IntelligenceActionLink href="/market-intelligence/map">🗺️ פתח מפה</IntelligenceActionLink>
            <IntelligenceActionLink href="/market-intelligence/dashboard">📊 פתח מודיעין שוק</IntelligenceActionLink>
            <IntelligenceActionLink href="/admin/system-health">⚙️ רענן מערכת</IntelligenceActionLink>
          </IntelligenceActionBar>
        }
      />

      {f && <p className="text-muted text-xs">{f.hint}</p>}

      {/* Onboarding empty state (the view below owns the real "סנכרן עכשיו"). */}
      {listings.length === 0 && (
        <IntelligenceEmptyState
          title="עדיין אין נכסי שוק חיצוניים זמינים"
          steps={["סנכרן נכסים חיצוניים — לחץ ״סנכרן עכשיו״ למטה", "רענן מערכת", "חזור לכאן לעיון בנכסי השוק"]}
        />
      )}

      <ExternalListingsView listings={listings} marketStats={marketStats} isAdmin={isAdmin} matches={matches} />
    </IntelligencePage>
  );
}
