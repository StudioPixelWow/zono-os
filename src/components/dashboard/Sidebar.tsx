"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems } from "@/data/mock";
import { Icon } from "./Icon";

/** Routes wired so far. Items without a route stay visual-only for now. */
const HREFS: Record<string, string> = {
  home: "/",
  command: "/command",
  map: "/market",
  properties: "/properties",
  buyers: "/buyers",
  sellers: "/sellers",
  matches: "/matches",
  deals: "/deals",
  transactions: "/transactions",
  "transactions-streets": "/transactions/streets",
  "transactions-radar": "/transactions/radar",
  forecast: "/forecast",
  revenue: "/revenue",
  acquisition: "/acquisition",
  competitors: "/competitors",
  marketing: "/marketing",
  distribution: "/distribution",
  "social-leads": "/social-leads",
  routing: "/routing",
  team: "/team",
  graph: "/graph",
  "operating-areas": "/settings/operating-areas",
  "system-health": "/admin/system-health",
};

/**
 * Slim, white RTL sidebar (start side in RTL). Active item gets the purple
 * treatment, derived from the current path. Hidden on mobile (bottom nav).
 */
export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string | undefined) => {
    if (!href) return false;
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  };

  return (
    <aside className="bg-card/80 border-line sticky top-0 hidden h-screen w-[88px] shrink-0 flex-col items-center border-s py-6 backdrop-blur-xl lg:flex">
      <div className="bg-brand text-white mb-8 grid h-11 w-11 place-items-center rounded-2xl text-lg font-black shadow-[0_8px_20px_rgba(124,58,237,0.35)]">
        Z
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {navItems.map((item) => {
          const href = HREFS[item.id];
          const active = isActive(href);
          const className = cn(
            "group relative flex w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-2.5 transition-all",
            active
              ? "bg-brand-soft text-brand-strong"
              : "text-muted hover:bg-surface hover:text-ink",
          );
          const inner = (
            <>
              {active && (
                <span className="bg-brand absolute -end-[10px] top-1/2 h-7 w-1 -translate-y-1/2 rounded-full" />
              )}
              <Icon name={item.icon} size={22} strokeWidth={active ? 2.1 : 1.75} />
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </>
          );

          return href ? (
            <Link key={item.id} href={href} title={item.label} className={className}>
              {inner}
            </Link>
          ) : (
            <button key={item.id} type="button" title={item.label} className={className}>
              {inner}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
