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
import { ZonoLogo } from "@/components/brand/ZonoLogo";
import { useCurrentUser } from "./DashboardDataProvider";
import { isManagerRole } from "@/lib/auth/office-roles";

import { NAV_GROUPS, ACCENTS, type NavGroup } from "./nav-groups";

const COLLAPSE_KEY = "zono-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  // Manager/owner-only launcher items (e.g. office management) — gated by the
  // session role so agents never see a surface they'd be redirected away from.
  const isManager = isManagerRole(useCurrentUser()?.roleKey ?? "");
  const groups: NavGroup[] = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !it.managerOnly || isManager) }));
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
  const activeHref = groups
    .flatMap((g) => g.items.map((it) => it.href))
    .filter((h) => !h.includes("#") && matches(h))
    .sort((a, b) => b.length - a.length)[0] ?? null;
  const itemActive = (href: string) => !href.includes("#") && href === activeHref;
  const activeGroupKey = groups.find((g) => g.items.some((it) => it.href === activeHref))?.key ?? null;
  // Derived (no effect): by default ONLY the first group ("היום שלי")
  // is open; every other group stays closed/compact until the user opens it.
  const openGroupKey = openOverride === undefined ? "command" : openOverride;

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
        collapsed ? "w-[78px] items-center" : "w-56",
      )}
    >
      {/* Logo — prominent, aspect-preserved, with breathing room */}
      <Link href="/" aria-label="ZONO" className={cn("mb-5 flex items-center", collapsed ? "justify-center" : "px-5")}>
        <ZonoLogo width={collapsed ? 40 : 112} height={collapsed ? 40 : 38} className={cn("object-contain", collapsed ? "h-10 w-10" : "h-auto w-[112px]")} priority />
      </Link>

      {/* Compact search / command — demoted from the prominent button so branding
          + navigation lead. Same palette event; functionality preserved. */}
      <div className={cn("mb-4", collapsed ? "flex justify-center" : "px-3")}>
        {collapsed ? (
          <button type="button" onClick={() => window.dispatchEvent(new Event("zono:command-open"))} title="חיפוש · ⌘K" aria-label="חיפוש" className="text-muted hover:text-ink hover:bg-surface border-line grid h-11 w-11 place-items-center rounded-2xl border transition">
            <Icon name="Search" size={20} />
          </button>
        ) : (
          <button type="button" onClick={() => window.dispatchEvent(new Event("zono:command-open"))} className="border-line text-muted hover:text-ink hover:border-brand-light bg-card flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold transition">
            <Icon name="Search" size={16} /> <span className="flex-1 text-right">חיפוש מהיר</span> <span className="text-[10px] font-black opacity-60">⌘K</span>
          </button>
        )}
      </div>

      {/* Launcher groups (only this area scrolls) */}
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => {
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
