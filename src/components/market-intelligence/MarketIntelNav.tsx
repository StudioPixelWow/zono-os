// ============================================================================
// 🌍 Market Intelligence section nav — Phase 26.7.2 (presentation only · RTL).
// ----------------------------------------------------------------------------
// A persistent breadcrumb + tab bar across the Market Intelligence section. It
// ONLY navigates to EXISTING pages — no new screens, no data, no logic. The
// active tab is passed explicitly by each page (server-safe; no hooks), so this
// stays a plain server component that can also be embedded in client views.
// ============================================================================
import Link from "next/link";

export interface Crumb { label: string; href?: string }

interface NavTab { key: string; label: string; href: string }

/** Every tab points to a route/surface that already exists. */
const TABS: NavTab[] = [
  { key: "dashboard", label: "דשבורד", href: "/market-intelligence/dashboard" },
  { key: "listings", label: "מודעות שוק", href: "/market-intelligence/listings" },
  { key: "opportunities", label: "הזדמנויות", href: "/market-intelligence/listings?focus=opportunities" },
  { key: "price-drops", label: "ירידות מחיר", href: "/market-intelligence/listings?focus=price-drops" },
  { key: "likely-exit", label: "יציאה צפויה מהשוק", href: "/market-intelligence/listings?focus=likely-exit" },
  { key: "map", label: "מפת שוק חיה", href: "/market-intelligence/map" },
  { key: "heatmap", label: "מפת חום", href: "/market" },
  { key: "radar", label: "רדאר נכסים", href: "/property-radar" },
];

export function MarketIntelNav({ active, crumbs }: { active: string; crumbs?: Crumb[] }) {
  return (
    <nav dir="rtl" className="flex flex-col gap-2">
      {/* Breadcrumbs — always rooted at the Market Intelligence section. */}
      <ol className="text-muted flex flex-wrap items-center gap-1.5 text-xs">
        <li><Link href="/market-intelligence" className="hover:text-ink font-bold">מודיעין שוק</Link></li>
        {(crumbs ?? []).map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span aria-hidden className="text-muted/60">›</span>
            {c.href ? <Link href={c.href} className="hover:text-ink font-bold">{c.label}</Link> : <span className="text-ink font-bold">{c.label}</span>}
          </li>
        ))}
      </ol>

      {/* Persistent section tab bar — navigation to existing pages only. */}
      <div className="border-line bg-card flex flex-wrap gap-1 rounded-2xl border p-1.5">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              prefetch={false}
              aria-current={on ? "page" : undefined}
              className={
                on
                  ? "bg-brand-soft text-brand-strong rounded-xl px-3 py-1.5 text-sm font-bold whitespace-nowrap transition"
                  : "text-muted hover:bg-surface hover:text-ink rounded-xl px-3 py-1.5 text-sm font-bold whitespace-nowrap transition"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
