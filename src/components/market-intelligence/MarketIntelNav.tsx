// ============================================================================
// 🌍 Market Intelligence section nav — Phase 26.7.2 / relabeled 26.7.3.
// ----------------------------------------------------------------------------
// Persistent breadcrumb + tab bar across the Market Intelligence section, now
// built on the Global Intelligence Framework (Phase 26.8) so it shares one
// design language. It ONLY navigates to EXISTING pages — no new screens, no
// data, no logic. Active tab is passed explicitly (server-safe).
// ============================================================================
import { IntelligenceBreadcrumbs, IntelligenceTabs, type Crumb } from "@/components/intelligence/framework";

export type { Crumb };

/** Every tab points to a route/surface that already exists. The section now LEADS
 *  with the synthesized command center; the former query-only tabs (הזדמנויות /
 *  ירידות מחיר / Likely Exit) were removed — they resolved to the same listings
 *  page with only a hint changed, and their intelligence now lives, synthesized,
 *  in the command center itself. */
const TABS: { key: string; label: string; href: string }[] = [
  { key: "center", label: "מרכז מודיעין", href: "/market-intelligence" },
  { key: "listings", label: "נכסי השוק", href: "/market-intelligence/listings" },
  { key: "dashboard", label: "דשבורד מודיעין", href: "/market-intelligence/dashboard" },
  { key: "map", label: "מפת שוק חיה", href: "/market-intelligence/map" },
  { key: "heatmap", label: "Heatmap", href: "/market" },
  { key: "radar", label: "Property Radar", href: "/property-radar" },
];

export function MarketIntelNav({ active, crumbs }: { active: string; crumbs?: Crumb[] }) {
  return (
    <nav dir="rtl" className="flex flex-col gap-2">
      <IntelligenceBreadcrumbs crumbs={[{ label: "מודיעין שוק", href: "/market-intelligence" }, ...(crumbs ?? [])]} />
      <IntelligenceTabs tabs={TABS} active={active} />
    </nav>
  );
}
