"use client";
// ============================================================================
// ZONO Launcher sidebar (Phase 26.8.3). A premium product launcher — not an
// admin accordion. Five Hebrew launcher groups, each a full-width tile with a
// large accent icon, title and short description. The group that owns the
// active route opens by default (fallback: מרכז הבקרה); nested links live inside
// their tile. Collapsed → an icon rail whose hover/focus flyout shows the group
// title + description + links. Navigation / presentation only — every href is an
// EXISTING route; no business logic, DB, API, engine, sync or calc changes. RTL.
// ============================================================================
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { ZonoCommandButton } from "@/components/navigation/zono-command-center";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

type Accent = "purple" | "blue" | "green" | "amber" | "slate";
interface NavItem { label: string; href: string; icon: string }
interface NavGroup { key: string; title: string; desc: string; icon: string; accent: Accent; items: NavItem[] }

/** Subtle per-group accents — used only for icon tile + active states. */
const ACCENTS: Record<Accent, { iconBg: string; ring: string; activeItem: string }> = {
  purple: { iconBg: "bg-brand-soft text-brand-strong", ring: "border-brand-light", activeItem: "bg-brand-soft text-brand-strong" },
  blue:   { iconBg: "bg-sky-50 text-sky-600",          ring: "border-sky-200",     activeItem: "bg-sky-50 text-sky-700" },
  green:  { iconBg: "bg-emerald-50 text-emerald-600",  ring: "border-emerald-200", activeItem: "bg-emerald-50 text-emerald-700" },
  amber:  { iconBg: "bg-amber-50 text-amber-600",      ring: "border-amber-200",   activeItem: "bg-amber-50 text-amber-700" },
  slate:  { iconBg: "bg-slate-100 text-slate-600",     ring: "border-slate-300",   activeItem: "bg-slate-100 text-slate-700" },
};

/** The ZONO information architecture — 5 launcher groups, existing routes only. */
const GROUPS: NavGroup[] = [
  { key: "command", title: "מרכז הבקרה", desc: "AI • משימות • מרכז הפעולות", icon: "Flame", accent: "purple", items: [
    { label: "דף הבית", href: "/", icon: "Home" },
    { label: "Mission Control", href: "/mission-control", icon: "Sparkles" },
    { label: "מרכז הפעולות", href: "/action-center", icon: "Flame" },
  ]},
  { key: "office", title: "המשרד שלי", desc: "נכסים • קונים • מוכרים • עסקאות", icon: "Building2", accent: "blue", items: [
    { label: "הנכסים שלי", href: "/my-properties", icon: "Building" },
    { label: "מלאי המשרד", href: "/office-inventory", icon: "Building2" },
    { label: "קונים", href: "/buyers", icon: "Users" },
    { label: "מוכרים", href: "/sellers", icon: "UserCheck" },
    { label: "עסקאות", href: "/deals", icon: "Handshake" },
  ]},
  { key: "market", title: "השוק", desc: "נכסי שוק • מודיעין • מפה • רדאר", icon: "Globe", accent: "green", items: [
    { label: "נכסי השוק", href: "/market-intelligence/listings", icon: "Globe" },
    { label: "מודיעין שוק", href: "/market-intelligence/dashboard", icon: "Map" },
    { label: "מפת שוק חיה", href: "/market-intelligence/map", icon: "MapPin" },
    { label: "רדאר נכסים", href: "/property-radar", icon: "Locate" },
    { label: "חיפוש מודיעין", href: "/intelligence-explorer", icon: "Search" },
  ]},
  { key: "intelligence", title: "מודיעין עסקי", desc: "סוכנים • משרדים • שכונות • דאטה", icon: "BarChart3", accent: "amber", items: [
    { label: "דאטה משרדי תיווך", href: "/brokerage-data", icon: "Database" },
    { label: "מודיעין סוכנים", href: "/broker-intelligence/dashboard", icon: "Users" },
    { label: "מודיעין משרדים", href: "/office-intelligence/dashboard", icon: "Building2" },
    { label: "מודיעין שכונות", href: "/neighborhood-intelligence/dashboard", icon: "Map" },
  ]},
  { key: "management", title: "ניהול המערכת", desc: "המלצות • צוות • מסמכים • הגדרות", icon: "Settings", accent: "slate", items: [
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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // undefined = follow active group; string = user-opened group; null = all closed.
  const [openOverride, setOpenOverride] = useState<string | null | undefined>(undefined);

  const pathActive = (href: string) => {
    const base = href.split("#")[0];
    return base === "/" ? pathname === "/" : pathname.startsWith(base);
  };
  const itemActive = (href: string) => (href.includes("#") ? false : pathActive(href));
  const activeGroupKey = GROUPS.find((g) => g.items.some((it) => itemActive(it.href)))?.key ?? null;
  // Derived (no effect): active group opens by default, fallback מרכז הבקרה.
  const openGroupKey = openOverride === undefined ? (activeGroupKey ?? "command") : openOverride;

  useEffect(() => {
    queueMicrotask(() => {
      try { if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true); } catch { /* storage unavailable */ }
    });
  }, []);

  const persistCollapsed = (v: boolean) => { try { window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* ignore */ } };

  return (
    <aside
      style={{ "--chatbot-safe-space": "120px" } as CSSProperties}
      className={cn(
        "bg-card/70 border-line sticky top-0 hidden h-screen shrink-0 flex-col border-s pt-5 pb-[var(--chatbot-safe-space)] backdrop-blur-xl transition-[width] duration-200 lg:flex",
        collapsed ? "w-[78px] items-center" : "w-72",
      )}
    >
      {/* Logo */}
      <Link href="/" aria-label="ZONO" className={cn("mb-3 grid h-11 w-11 place-items-center rounded-2xl", collapsed ? "" : "ms-4")}>
        <ZonoLogo width={44} height={44} className="!h-11 !w-11 object-contain" />
      </Link>

      {/* ⌘K launcher — kept once */}
      <div className={cn("mb-3 flex flex-col items-center", collapsed ? "" : "px-4")}>
        <ZonoCommandButton />
        <span className="text-muted mt-0.5 text-[8px] font-extrabold tracking-wide">⌘K</span>
      </div>

      {/* Launcher groups (only this area scrolls) */}
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((g) => {
          const a = ACCENTS[g.accent];
          const groupActive = g.key === activeGroupKey;

          if (collapsed) {
            return (
              <div key={g.key} className="group/fly relative flex justify-center">
                <button
                  type="button"
                  title={`${g.title} — ${g.desc}`}
                  onClick={() => { setCollapsed(false); persistCollapsed(false); setOpenOverride(g.key); }}
                  className={cn("grid h-12 w-12 place-items-center rounded-2xl border transition", groupActive ? cn(a.iconBg, a.ring) : "border-transparent text-muted hover:bg-surface hover:text-ink")}
                >
                  <Icon name={g.icon} size={22} strokeWidth={groupActive ? 2.1 : 1.8} />
                </button>
                {/* Flyout launcher */}
                <div className="border-line bg-card invisible absolute end-full top-0 z-50 me-2 w-64 rounded-2xl border p-2.5 opacity-0 shadow-sm transition group-hover/fly:visible group-hover/fly:opacity-100 group-focus-within/fly:visible group-focus-within/fly:opacity-100">
                  <div className="mb-2 flex items-center gap-2.5">
                    <span className={cn("grid h-9 w-9 place-items-center rounded-xl", a.iconBg)}><Icon name={g.icon} size={18} /></span>
                    <span className="min-w-0"><span className="text-ink block truncate text-sm font-black">{g.title}</span><span className="text-muted block truncate text-[11px]">{g.desc}</span></span>
                  </div>
                  {g.items.map((it) => (
                    <Link key={it.href + it.label} href={it.href} prefetch={false} className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-bold transition", itemActive(it.href) ? a.activeItem : "text-ink hover:bg-surface")}>
                      <Icon name={it.icon} size={15} /> <span className="truncate">{it.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          }

          const open = openGroupKey === g.key;
          return (
            <div key={g.key} className={cn("rounded-2xl border p-2.5 transition", open ? "bg-card shadow-sm" : "bg-card/50 hover:bg-card", groupActive ? a.ring : "border-line")}>
              {/* Launcher tile */}
              <button type="button" onClick={() => setOpenOverride(open ? null : g.key)} aria-expanded={open} className="flex w-full items-center gap-3 text-right">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", a.iconBg)}>
                  <Icon name={g.icon} size={22} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm font-black">{g.title}</span>
                  <span className="text-muted block truncate text-[11px]">{g.desc}</span>
                </span>
                <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} className="text-muted shrink-0" />
              </button>

              {/* Nested links (inside the tile) */}
              {open && (
                <div className="border-line/60 mt-2 flex flex-col gap-0.5 border-t pt-2">
                  {g.items.map((it) => {
                    const active = itemActive(it.href);
                    return (
                      <Link
                        key={it.href + it.label}
                        href={it.href}
                        prefetch={false}
                        title={it.label}
                        className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-bold transition", active ? a.activeItem : "text-muted hover:bg-surface hover:text-ink")}
                      >
                        <Icon name={it.icon} size={15} strokeWidth={active ? 2.1 : 1.75} />
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

      {/* Collapse / expand */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => { const next = !c; persistCollapsed(next); return next; })}
        title={collapsed ? "הרחב תפריט" : "כווץ תפריט"}
        className={cn("text-muted hover:text-ink mt-2 flex items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-surface", collapsed ? "justify-center" : "ms-3")}
      >
        <Icon name={collapsed ? "ChevronLeft" : "ChevronRight"} size={18} />
        {!collapsed && <span className="text-[11px] font-bold">כווץ תפריט</span>}
      </button>
    </aside>
  );
}
