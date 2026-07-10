"use client";
// ============================================================================
// ZONO Launcher sidebar. A premium product launcher — not an admin accordion.
// Seven Hebrew OS launcher groups, each a full-width tile with a large accent
// icon, title and short description. The group that owns the
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

/** The ZONO information architecture — 7 OS launcher groups. Every href below is
 *  an EXISTING route (verified against the app router). One href per item, no
 *  duplicates, no dead links. Surfaces without a dedicated page (e.g. approvals,
 *  missions) live inside their hub and are reachable via the ⌘K palette. */
const GROUPS: NavGroup[] = [
  { key: "command", title: "מרכז הבקרה", desc: "בית • Daily OS • Broker Brain", icon: "Flame", accent: "purple", items: [
    { label: "דף הבית", href: "/", icon: "Home" },
    { label: "היום · Daily OS", href: "/today", icon: "Sun" },
    { label: "מוח הברוקר", href: "/brain", icon: "Sparkles" },
    { label: "Mission Control", href: "/mission-control", icon: "Target" },
    { label: "מרכז הפעולות", href: "/action-center", icon: "Flame" },
  ]},
  { key: "office", title: "המשרד שלי", desc: "נכסים • אנשים • עסקאות • יומן", icon: "Building2", accent: "blue", items: [
    { label: "נכסים", href: "/properties", icon: "Building" },
    { label: "קונים", href: "/buyers", icon: "Users" },
    { label: "מוכרים", href: "/sellers", icon: "UserCheck" },
    { label: "לידים", href: "/social-leads", icon: "UserPlus" },
    { label: "עסקאות", href: "/deals", icon: "Handshake" },
    { label: "פגישות", href: "/calendar", icon: "Calendar" },
  ]},
  { key: "marketing", title: "תקשורת ושיווק", desc: "WhatsApp • Facebook • קמפיינים", icon: "Megaphone", accent: "green", items: [
    { label: "WhatsApp", href: "/whatsapp", icon: "MessageCircle" },
    { label: "Facebook", href: "/facebook", icon: "Send" },
    { label: "פרסום בקבוצות", href: "/distribution", icon: "Megaphone" },
    { label: "קמפיינים", href: "/distribution/campaign-wizard", icon: "Target" },
    { label: "Marketing OS", href: "/marketing", icon: "BarChart3" },
    { label: "Creative Studio", href: "/creative-studio", icon: "Presentation" },
  ]},
  { key: "intelligence", title: "מודיעין עסקי", desc: "Executive • Territory • תחזיות", icon: "BarChart3", accent: "amber", items: [
    { label: "Executive OS", href: "/executive", icon: "BarChart3" },
    { label: "Territory OS", href: "/territory", icon: "Map" },
    { label: "תחזיות", href: "/predictions", icon: "TrendingUp" },
    { label: "Knowledge Graph", href: "/graph", icon: "Layers" },
    { label: "Marketplace Intelligence", href: "/marketplace", icon: "Globe" },
    { label: "מפת חום שוק", href: "/market-intelligence/map", icon: "MapPin" },
  ]},
  { key: "sites", title: "אתרים ופורטלים", desc: "אתרי משרד/סוכן • דפי נחיתה • פורטלים", icon: "Globe", accent: "blue", items: [
    { label: "אתר משרד", href: "/office-website", icon: "Building2" },
    { label: "אתר סוכן", href: "/agent-website", icon: "UserCheck" },
    { label: "אתרים ודפי נחיתה", href: "/website", icon: "LayoutGrid" },
    { label: "פורטלים (קונה/מוכר)", href: "/portals", icon: "Users" },
  ]},
  { key: "ops", title: "אוטומציה ותפעול", desc: "Automation • Workflows • Voice AI", icon: "Route", accent: "green", items: [
    { label: "Automation OS", href: "/automation", icon: "Route" },
    { label: "Workflows", href: "/workflow-builder", icon: "ListChecks" },
    { label: "מסעות לקוח", href: "/journeys", icon: "Activity" },
    { label: "Voice AI", href: "/voice", icon: "Mic" },
    { label: "Self-Learning", href: "/learning", icon: "Sparkles" },
  ]},
  { key: "system", title: "ניהול מערכת", desc: "האזור האישי • צוות • חיבורים • הגדרות", icon: "Settings", accent: "slate", items: [
    { label: "האזור האישי", href: "/my-profile", icon: "UserCircle" },
    { label: "צוות וסוכנים", href: "/team", icon: "UserCheck" },
    { label: "חיבורים", href: "/settings/distribution-connections", icon: "Send" },
    { label: "מסמכים", href: "/documents", icon: "FileText" },
    { label: "דאטה משרדי תיווך", href: "/brokerage-data", icon: "Database" },
    { label: "הגדרות", href: "/settings", icon: "Settings" },
  ]},
];

const COLLAPSE_KEY = "zono-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // undefined = follow active group; string = user-opened group; null = all closed.
  const [openOverride, setOpenOverride] = useState<string | null | undefined>(undefined);

  // Boundary-aware match (so "/market-intelligence/map" doesn't light up "/marketing",
  // and "/settings/distribution-connections" doesn't also light up "/settings").
  const matches = (href: string) => {
    const base = href.split("#")[0];
    if (base === "/") return pathname === "/";
    return pathname === base || pathname.startsWith(`${base}/`);
  };
  // Exactly ONE active item — the longest matching base wins.
  const activeHref = GROUPS
    .flatMap((g) => g.items.map((it) => it.href))
    .filter((h) => !h.includes("#") && matches(h))
    .sort((a, b) => b.length - a.length)[0] ?? null;
  const itemActive = (href: string) => !href.includes("#") && href === activeHref;
  const activeGroupKey = GROUPS.find((g) => g.items.some((it) => it.href === activeHref))?.key ?? null;
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
