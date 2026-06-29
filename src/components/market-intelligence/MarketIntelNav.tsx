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

/** Every tab points to a route/surface that already exists. */
const TABS: { key: string; label: string; href: string }[] = [
  { key: "listings", label: "נכסי השוק", href: "/market-intelligence/listings" },
  { key: "dashboard", label: "דשבורד מודיעין", href: "/market-intelligence/dashboard" },
  { key: "opportunities", label: "הזדמנויות", href: "/market-intelligence/listings?focus=opportunities" },
  { key: "price-drops", label: "ירידות מחיר", href: "/market-intelligence/listings?focus=price-drops" },
  { key: "likely-exit", label: "Likely Market Exit", href: "/market-intelligence/listings?focus=likely-exit" },
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
