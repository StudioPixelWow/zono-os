// ============================================================================
// 🌍 /market-intelligence/listings — the DIRECT entry point to external market
// listings (Phase 26.7.2). Navigation/presentation only. Reuses the EXISTING
// ExternalListingsView component + the shared loadMarketListings() loader (same
// external repository). No new data source, no business logic, no calculations.
// An optional ?focus= query only drives the breadcrumb + active tab (the listing
// signals — opportunities / price drops / likely exit — already live in the
// view); it never changes what is fetched.
// ============================================================================
import { loadMarketListings } from "@/lib/external-listings/market-listings-data";
import { ExternalListingsView } from "../../properties/ExternalListingsView";
import { MarketIntelNav, type Crumb } from "@/components/market-intelligence/MarketIntelNav";

export const dynamic = "force-dynamic";
// ExternalListingsView's "Sync Now" runs as a server action from this page, so
// it needs the Node runtime + full duration budget (same as the landing page).
export const runtime = "nodejs";
export const maxDuration = 300;

const FOCUS: Record<string, { active: string; label: string; hint: string }> = {
  opportunities: { active: "opportunities", label: "הזדמנויות", hint: "ממוקד בהזדמנויות מובילות (AI Score גבוה) מתוך מודעות השוק." },
  "price-drops": { active: "price-drops", label: "ירידות מחיר", hint: "ממוקד במודעות עם ירידות מחיר שזוהו בשוק." },
  "likely-exit": { active: "likely-exit", label: "יציאה צפויה מהשוק", hint: "ממוקד במודעות עם סבירות גבוהה ליציאה מהשוק." },
};

export default async function MarketListingsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const f = focus ? FOCUS[focus] : undefined;
  const { listings, marketStats, isAdmin, matches } = await loadMarketListings();

  const crumbs: Crumb[] = [{ label: "מודעות שוק", href: "/market-intelligence/listings" }];
  if (f) crumbs.push({ label: f.label });

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <MarketIntelNav active={f?.active ?? "listings"} crumbs={crumbs} />
      {f && <p className="text-muted text-xs">{f.hint}</p>}

      {/* Honest empty state (the existing view also offers the Sync action below). */}
      {listings.length === 0 && (
        <div className="border-line bg-card rounded-2xl border border-dashed p-5 text-center">
          <p className="text-ink font-bold">אין כרגע מודעות שוק חיצוניות זמינות.</p>
          <p className="text-muted mt-1 text-sm">הפעל סנכרון שוק כדי להתחיל לאסוף מודיעין שוק — לחץ ״סנכרן עכשיו״ למטה.</p>
        </div>
      )}

      <ExternalListingsView listings={listings} marketStats={marketStats} isAdmin={isAdmin} matches={matches} />
    </div>
  );
}
