"use client";
// ============================================================================
// ZONO mobile navigation drawer (RTL). Opened by the header hamburger / bottom-nav
// "עוד" via the `zono:open-menu` event. Reuses the SAME NAV_GROUPS source of truth
// as the desktop sidebar — no second hardcoded menu. Overlay + body-scroll lock +
// Escape/overlay/nav-click close; active group opens by default; account link kept.
// ============================================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { ZonoLogo } from "@/components/brand/ZonoLogo";
import { useCurrentUser } from "./DashboardDataProvider";
import { isManagerRole } from "@/lib/auth/office-roles";
import { NAV_GROUPS, ACCENTS, type NavGroup } from "./nav-groups";

export function MobileDrawer() {
  const pathname = usePathname();
  const isManager = isManagerRole(useCurrentUser()?.roleKey ?? "");
  const groups: NavGroup[] = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !it.managerOnly || isManager) }));
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("zono:open-menu", onOpen);
    return () => window.removeEventListener("zono:open-menu", onOpen);
  }, []);

  // (Nav links close the drawer via their own onClick — no route-change effect needed.)

  // Escape closes + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  const matches = (href: string) => {
    const base = href.split("#")[0];
    if (base === "/") return pathname === "/";
    return pathname === base || pathname.startsWith(`${base}/`);
  };
  const activeHref = groups.flatMap((g) => g.items.map((it) => it.href)).filter((h) => matches(h)).sort((a, b) => b.length - a.length)[0] ?? null;
  const activeGroupKey = groups.find((g) => g.items.some((it) => it.href === activeHref))?.key ?? null;
  const openGroupKey = openGroup === undefined ? (activeGroupKey ?? "command") : openGroup;

  return (
    <div className={cn("fixed inset-0 z-[60] lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      <div onClick={() => setOpen(false)} className={cn("absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} />
      <aside
        dir="rtl" role="dialog" aria-modal="true" aria-label="תפריט ניווט"
        className={cn("bg-card border-line absolute inset-y-0 start-0 flex h-full w-[88vw] max-w-sm flex-col border-e shadow-2xl transition-transform duration-200", open ? "translate-x-0" : "translate-x-full")}
      >
        <div className="border-line flex items-center justify-between border-b px-4 py-3.5">
          <Link href="/" aria-label="ZONO" onClick={() => setOpen(false)}><ZonoLogo width={96} height={32} className="h-auto w-[96px] object-contain" /></Link>
          <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="text-muted hover:text-ink hover:bg-surface grid h-11 w-11 place-items-center rounded-2xl transition"><Icon name="X" size={22} /></button>
        </div>

        <div className="px-4 pt-3">
          <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event("zono:command-open")); }} className="border-line text-muted hover:text-ink bg-surface flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition">
            <Icon name="Search" size={18} /> <span className="flex-1 text-right">חיפוש מהיר</span> <span className="text-[10px] font-black opacity-60">⌘K</span>
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((g) => {
            const a = ACCENTS[g.accent];
            const groupActive = g.key === activeGroupKey;
            const gOpen = openGroupKey === g.key;
            return (
              <div key={g.key} className={cn("mb-2 rounded-2xl border p-2 transition", gOpen ? "bg-card shadow-sm" : "bg-card/60", groupActive ? a.ring : "border-line")}>
                <button type="button" onClick={() => setOpenGroup(gOpen ? null : g.key)} aria-expanded={gOpen} className="flex w-full items-center gap-3 text-right">
                  <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", a.iconBg)}><Icon name={g.icon} size={22} strokeWidth={2} /></span>
                  <span className="min-w-0 flex-1"><span className="text-ink block truncate text-[15px] font-black">{g.title}</span><span className="text-muted block truncate text-[11px]">{g.desc}</span></span>
                  <Icon name={gOpen ? "ChevronUp" : "ChevronDown"} size={18} className="text-muted shrink-0" />
                </button>
                {gOpen && (
                  <div className="border-line/60 mt-2 flex flex-col gap-0.5 border-t pt-2">
                    {g.items.map((it) => {
                      const active = it.href === activeHref;
                      return (
                        <Link key={it.href + it.label} href={it.href} prefetch={false} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-bold transition", active ? a.activeItem : "text-muted hover:bg-surface hover:text-ink")}>
                          <Icon name={it.icon} size={18} strokeWidth={active ? 2.1 : 1.75} /> <span className="truncate">{it.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-line border-t p-3">
          <Link href="/my-profile" prefetch={false} onClick={() => setOpen(false)} className="text-ink hover:bg-surface flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-bold transition">
            <Icon name="UserCircle" size={20} /> <span>האזור האישי</span>
          </Link>
        </div>
      </aside>
    </div>
  );
}
