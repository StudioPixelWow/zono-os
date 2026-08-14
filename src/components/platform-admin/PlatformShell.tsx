"use client";
// ============================================================================
// ZONO — Platform Admin shell (P5.1). The premium control-plane frame: a right-
// anchored (RTL) navigation rail, a dense operator topbar, and the ⌘K command
// palette. Deliberately NOT the lavender customer app: light neutral canvas,
// hairline dividers, minimal shadow — an operator always knows they left the
// customer product. Nav items are capability-gated for UX; real authorization
// is enforced server-side on every /platform route.
// ============================================================================
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";
import { PLATFORM_NAV, PLATFORM_ROLE_LABEL, isNavGroup, type PlatformNavItem } from "./nav-model";
import { PlatformCommandPalette } from "./PlatformCommandPalette";

export interface PlatformShellProps {
  operator: { name: string | null; role: string; caps: string[] };
  env: string;
  children: ReactNode;
}

function useActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/platform" ? pathname === "/platform" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavContent({ caps, onNavigate }: { caps: string[]; onNavigate?: () => void }) {
  const isActive = useActive();
  const allowed = (cap: string) => caps.includes(cap);
  const groupVisible = (item: PlatformNavItem) =>
    isNavGroup(item) ? item.children.some((c) => allowed(c.cap)) : allowed(item.cap);

  return (
    <nav className="flex flex-col gap-1 p-3">
      {PLATFORM_NAV.map((item) => {
        if (isNavGroup(item)) {
          if (!groupVisible(item)) return null;
          return (
            <div key={item.label} className="mt-2 first:mt-0">
              <p className="text-muted/70 flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide">
                <Icon name={item.icon} size={13} />{item.label}
              </p>
              {item.children.map((leaf) => {
                const can = allowed(leaf.cap);
                const active = isActive(leaf.href);
                const cls = cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors",
                  active ? "bg-brand-soft text-brand-strong" : can ? "text-ink hover:bg-surface" : "text-muted/50 cursor-not-allowed",
                );
                const inner = (
                  <>
                    <Icon name={leaf.icon} size={16} className={active ? "text-brand" : undefined} />
                    <span className="truncate">{leaf.label}</span>
                    {!leaf.ready ? <span className="bg-warning-soft text-warning ms-auto rounded px-1.5 py-0.5 text-[9px] font-bold">בקרוב</span> : null}
                    {!can ? <Icon name="Lock" size={12} className="ms-auto opacity-60" /> : null}
                  </>
                );
                return can ? (
                  <Link key={leaf.href} href={leaf.href} onClick={onNavigate} className={cls} aria-current={active ? "page" : undefined}>{inner}</Link>
                ) : (
                  <div key={leaf.href} className={cls} aria-disabled="true" title="אין הרשאה">{inner}</div>
                );
              })}
            </div>
          );
        }
        // Top-level leaf (Overview, Support, Settings)
        const can = allowed(item.cap);
        const active = isActive(item.href);
        const cls = cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors",
          active ? "bg-brand-soft text-brand-strong" : can ? "text-ink hover:bg-surface" : "text-muted/50 cursor-not-allowed",
        );
        const inner = (
          <>
            <Icon name={item.icon} size={16} className={active ? "text-brand" : undefined} />
            <span className="truncate">{item.label}</span>
            {!item.ready ? <span className="bg-warning-soft text-warning ms-auto rounded px-1.5 py-0.5 text-[9px] font-bold">בקרוב</span> : null}
          </>
        );
        return can ? (
          <Link key={item.href} href={item.href} onClick={onNavigate} className={cls} aria-current={active ? "page" : undefined}>{inner}</Link>
        ) : (
          <div key={item.href} className={cls} aria-disabled="true">{inner}</div>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="zono-gradient grid h-9 w-9 place-items-center rounded-xl text-[15px] font-black text-white shadow-sm">Z</span>
      <div className="leading-tight">
        <p className="text-ink text-[15px] font-black">ZONO</p>
        <p className="text-muted -mt-0.5 text-[10.5px] font-bold tracking-wide">לוח בקרה</p>
      </div>
    </div>
  );
}

export function PlatformShell({ operator, env, children }: PlatformShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const roleLabel = PLATFORM_ROLE_LABEL[operator.role] ?? operator.role;
  const isProd = env === "production";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f7fb] text-ink">
      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        {/* Desktop nav rail (right in RTL) */}
        <aside className="border-line bg-card sticky top-0 hidden h-screen flex-col overflow-y-auto border-s lg:flex">
          <div className="border-line flex h-16 items-center border-b px-4"><BrandMark /></div>
          <NavContent caps={operator.caps} />
          <div className="border-line mt-auto border-t p-3">
            <p className="text-muted px-2 text-[11px] font-semibold">
              {operator.name ? operator.name : "מפעיל פלטפורמה"}
            </p>
            <p className="text-brand-strong px-2 text-[11px] font-bold">{roleLabel}</p>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen min-w-0 flex-col">
          {/* Topbar */}
          <header className="border-line bg-card/90 sticky top-0 z-40 flex h-16 items-center gap-3 border-b px-3 backdrop-blur sm:px-5">
            <button type="button" className="text-ink hover:bg-surface grid h-9 w-9 place-items-center rounded-lg lg:hidden" onClick={() => setMobileNav(true)} aria-label="תפריט">
              <Icon name="Menu" size={20} />
            </button>
            <div className="lg:hidden"><BrandMark /></div>

            <span className={cn("hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-flex", isProd ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", isProd ? "bg-success" : "bg-warning")} />
              {isProd ? "Production" : env || "Development"}
            </span>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="border-line text-muted hover:border-brand-light ms-auto flex h-9 items-center gap-2 rounded-xl border bg-surface px-3 text-[13px] font-semibold transition-colors"
            >
              <Icon name="Search" size={15} />
              <span className="hidden sm:inline">חיפוש ופעולות</span>
              <kbd className="border-line hidden rounded-md border bg-card px-1.5 text-[10px] font-bold sm:inline">⌘K</kbd>
            </button>

            <div className="border-line hidden items-center gap-2 border-s ps-3 sm:flex">
              <span className="zono-gradient grid h-8 w-8 place-items-center rounded-full text-[12px] font-black text-white">
                {(operator.name ?? "Z").trim().charAt(0)}
              </span>
              <div className="leading-tight">
                <p className="text-ink max-w-[140px] truncate text-[12.5px] font-bold">{operator.name ?? "מפעיל פלטפורמה"}</p>
                <p className="text-brand-strong text-[10.5px] font-bold">{roleLabel}</p>
              </div>
            </div>

            <form action={signOut}>
              <button type="submit" className="text-muted hover:text-danger grid h-9 w-9 place-items-center rounded-lg" aria-label="התנתקות" title="התנתקות">
                <Icon name="Lock" size={17} />
              </button>
            </form>
          </header>

          <main className="zono-scroll min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>

      {/* Mobile off-canvas nav */}
      {mobileNav && (
        <div className="fixed inset-0 z-[110] lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="סגור תפריט" className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setMobileNav(false)} />
          <div className="border-line bg-card absolute inset-y-0 end-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto border-s shadow-2xl">
            <div className="border-line flex h-16 items-center justify-between border-b px-4">
              <BrandMark />
              <button type="button" className="text-muted grid h-8 w-8 place-items-center rounded-lg" onClick={() => setMobileNav(false)} aria-label="סגור"><Icon name="X" size={18} /></button>
            </div>
            <NavContent caps={operator.caps} onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}

      {paletteOpen && <PlatformCommandPalette onClose={() => setPaletteOpen(false)} caps={operator.caps} />}
    </div>
  );
}
