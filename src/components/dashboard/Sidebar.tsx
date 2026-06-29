"use client";
// ============================================================================
// ZONO — primary sidebar (Phase 26.8.2). A grouped, hierarchical product menu:
// exactly 5 top-level groups (COMMAND · CRM · MARKET · INTELLIGENCE · MANAGEMENT).
//
//   • Expanded: group label + nested items; only one group open at a time, and
//     the group that owns the active route opens by default (accordion).
//   • Collapsed: a slim icon rail; hovering/focusing a group icon reveals a
//     flyout with that group's items (no endless vertical list). Tooltip on the
//     icon shows the GROUP name.
//
// Navigation only — every href points to an EXISTING route. No business logic,
// DB, API, engine, sync or calculation changes. RTL preserved.
// ============================================================================
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { ZonoCommandButton } from "@/components/navigation/zono-command-center";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

interface NavItem { label: string; href: string; icon: string }
interface NavGroup { key: string; label: string; icon: string; items: NavItem[] }

/** The agreed ZONO information architecture — 5 groups, existing routes only. */
const GROUPS: NavGroup[] = [
  { key: "command", label: "COMMAND", icon: "Flame", items: [
    { label: "דף הבית", href: "/", icon: "Home" },
    { label: "Mission Control", href: "/mission-control", icon: "Sparkles" },
    { label: "מרכז הפעולות", href: "/action-center", icon: "Flame" },
  ]},
  { key: "crm", label: "CRM", icon: "Users", items: [
    { label: "הנכסים שלי", href: "/my-properties", icon: "Building" },
    { label: "מלאי המשרד", href: "/office-inventory", icon: "Building2" },
    { label: "קונים", href: "/buyers", icon: "Users" },
    { label: "מוכרים", href: "/sellers", icon: "UserCheck" },
    { label: "עסקאות", href: "/deals", icon: "Handshake" },
  ]},
  { key: "market", label: "MARKET", icon: "Globe", items: [
    { label: "נכסי השוק", href: "/market-intelligence/listings", icon: "Globe" },
    { label: "מודיעין שוק", href: "/market-intelligence/dashboard", icon: "Map" },
    { label: "מפת שוק חיה", href: "/market-intelligence/map", icon: "MapPin" },
    { label: "רדאר נכסים", href: "/property-radar", icon: "Locate" },
    { label: "חיפוש מודיעין", href: "/intelligence-explorer", icon: "Search" },
  ]},
  { key: "intelligence", label: "INTELLIGENCE", icon: "BarChart3", items: [
    { label: "דאטה משרדי תיווך", href: "/brokerage-data", icon: "Database" },
    { label: "מודיעין סוכנים", href: "/broker-intelligence/dashboard", icon: "Users" },
    { label: "מודיעין משרדים", href: "/office-intelligence/dashboard", icon: "Building2" },
    { label: "מודיעין שכונות", href: "/neighborhood-intelligence/dashboard", icon: "Map" },
  ]},
  { key: "management", label: "MANAGEMENT", icon: "Briefcase", items: [
    { label: "המלצות", href: "/recommendations", icon: "Sparkles" },
    { label: "AI Memory", href: "/mission-control#memory", icon: "Layers" },
    { label: "משימות AI", href: "/mission-control#mission-planner", icon: "ListChecks" },
    { label: "ZONO קריאייטיב", href: "/creative", icon: "Presentation" },
    { label: "מודיעין שיווק", href: "/marketing", icon: "Megaphone" },
    { label: "צוות וסוכנים", href: "/team", icon: "UserCheck" },
    { label: "מסמכים", href: "/documents", icon: "FileText" },
    { label: "הגדרות", href: "/settings", icon: "Settings" },
  ]},
];

const COLLAPSE_KEY = "zono-sidebar-collapsed";

/**
 * Grouped hierarchical sidebar. Active-route detection works for nested routes
 * (prefix match). Hash shortcuts (e.g. /mission-control#memory) never claim the
 * active highlight, so only the canonical item lights up.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // undefined = follow the active group (accordion default); string = a group the
  // user explicitly opened; null = user explicitly collapsed all groups.
  const [openOverride, setOpenOverride] = useState<string | null | undefined>(undefined);

  const pathActive = (href: string) => {
    const base = href.split("#")[0];
    return base === "/" ? pathname === "/" : pathname.startsWith(base);
  };
  const itemActive = (href: string) => (href.includes("#") ? false : pathActive(href));
  const activeGroupKey = GROUPS.find((g) => g.items.some((it) => itemActive(it.href)))?.key ?? null;
  // Derived (no effect): the active group opens by default; user choice overrides.
  const openGroupKey = openOverride === undefined ? activeGroupKey : openOverride;

  // Restore collapse preference after mount (SSR paints expanded → no mismatch).
  useEffect(() => {
    queueMicrotask(() => {
      try { if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true); } catch { /* storage unavailable */ }
    });
  }, []);

  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });

  return (
    <aside
      style={{ "--chatbot-safe-space": "120px" } as CSSProperties}
      className={cn(
        "bg-card/80 border-line sticky top-0 hidden h-screen shrink-0 flex-col border-s pt-5 pb-[var(--chatbot-safe-space)] backdrop-blur-xl transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px] items-center" : "w-64",
      )}
    >
      {/* Logo */}
      <Link href="/" aria-label="ZONO" className={cn("mb-3 grid h-11 w-11 place-items-center rounded-2xl", collapsed ? "" : "ms-4")}>
        <ZonoLogo width={44} height={44} className="!h-11 !w-11 object-contain" />
      </Link>

      {/* ⌘K command launcher — kept once */}
      <div className={cn("mb-3 flex flex-col items-center", collapsed ? "" : "px-4")}>
        <ZonoCommandButton />
        <span className="text-muted mt-0.5 text-[8px] font-extrabold tracking-wide">⌘K</span>
      </div>

      {/* Navigation */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((g) => {
          const groupActive = g.key === activeGroupKey;
          const open = !collapsed && openGroupKey === g.key;

          if (collapsed) {
            // Icon + hover/focus flyout (no vertical expansion).
            return (
              <div key={g.key} className="group/fly relative flex justify-center">
                <button
                  type="button"
                  title={g.label}
                  onClick={() => { setCollapsed(false); setOpenOverride(g.key); try { window.localStorage.setItem(COLLAPSE_KEY, "0"); } catch { /* ignore */ } }}
                  className={cn("grid h-11 w-11 place-items-center rounded-2xl transition", groupActive ? "zono-active-nav-icon text-brand-strong" : "text-muted hover:bg-surface hover:text-ink")}
                >
                  <Icon name={g.icon} size={19} strokeWidth={groupActive ? 2.1 : 1.75} />
                </button>
                {/* Flyout (RTL: opens toward content, inline-end) */}
                <div className="border-line bg-card invisible absolute end-full top-0 z-50 me-2 w-56 rounded-2xl border p-2 opacity-0 shadow-[var(--shadow-lift)] transition group-hover/fly:visible group-hover/fly:opacity-100 group-focus-within/fly:visible group-focus-within/fly:opacity-100">
                  <p className="text-muted px-2 py-1 text-[10px] font-extrabold tracking-wide">{g.label}</p>
                  {g.items.map((it) => (
                    <Link key={it.href + it.label} href={it.href} prefetch={false} className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-bold transition", itemActive(it.href) ? "bg-brand-soft text-brand-strong" : "text-ink hover:bg-surface")}>
                      <Icon name={it.icon} size={16} /> <span className="truncate">{it.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          }

          // Expanded: accordion group header + nested items.
          return (
            <div key={g.key} className="flex flex-col">
              <button
                type="button"
                onClick={() => setOpenOverride(openGroupKey === g.key ? null : g.key)}
                className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition", groupActive ? "text-brand-strong" : "text-muted hover:text-ink")}
                aria-expanded={open}
              >
                <span className="flex items-center gap-2.5">
                  <Icon name={g.icon} size={17} strokeWidth={groupActive ? 2.1 : 1.75} />
                  <span className="text-[11px] font-extrabold tracking-wide">{g.label}</span>
                </span>
                <Icon name={open ? "ChevronUp" : "ChevronDown"} size={13} />
              </button>
              {open && (
                <div className="mb-1 flex flex-col gap-0.5 ps-2">
                  {g.items.map((it) => {
                    const active = itemActive(it.href);
                    return (
                      <Link
                        key={it.href + it.label}
                        href={it.href}
                        prefetch={false}
                        title={it.label}
                        className={cn("relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold transition", active ? "zono-active-nav text-brand-strong" : "text-muted hover:bg-surface hover:text-ink")}
                      >
                        {active && <span className="zono-gradient absolute -end-[6px] top-1/2 h-5 w-1 -translate-y-1/2 rounded-full" />}
                        <Icon name={it.icon} size={16} strokeWidth={active ? 2.1 : 1.75} />
                        <span className="truncate">{it.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse / expand toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "הרחב תפריט" : "כווץ תפריט"}
        className={cn("text-muted hover:text-ink mt-2 flex items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-surface", collapsed ? "justify-center" : "ms-2")}
      >
        <Icon name={collapsed ? "ChevronLeft" : "ChevronRight"} size={18} />
        {!collapsed && <span className="text-[11px] font-bold">כווץ תפריט</span>}
      </button>
    </aside>
  );
}
