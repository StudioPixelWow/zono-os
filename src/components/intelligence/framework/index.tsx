// ============================================================================
// 🧭 ZONO Global Intelligence Experience Framework™ — Phase 26.8.
// ----------------------------------------------------------------------------
// ONE reusable, premium, RTL design language for every Intelligence page so the
// whole platform feels identical: page shell, breadcrumbs, header/hero, action
// bar, KPI grid, tabs, sections, cards, feed, empty + loading states, sidebar,
// drawer, related intelligence. These are DUMB presentational components — they
// render values that already exist and never compute, fetch, or change logic.
// White surfaces · soft-lavender hero · single purple accent · generous spacing.
// ============================================================================
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export { IntelligenceDrawer } from "./IntelligenceDrawer";
export {
  IntelligenceFirstRun, IntelligenceProgress, IntelligenceScanStatus, IntelligenceModuleIntro,
  type ScanStage, type ScanStageStatus, type FirstRunSecondary,
} from "./first-run";

export interface Crumb { label: string; href?: string }

/** Page shell — consistent max width, RTL, spacing for every Intelligence page. */
export function IntelligencePage({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div dir="rtl" className={cn("mx-auto flex w-full flex-col gap-4 p-4 sm:p-6", wide ? "max-w-[1400px]" : "max-w-6xl", className)}>
      {children}
    </div>
  );
}

export function IntelligenceBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (!crumbs.length) return null;
  return (
    <ol dir="rtl" className="text-muted flex flex-wrap items-center gap-1.5 text-xs">
      {crumbs.map((c, i) => (
        <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-muted/60">›</span>}
          {c.href ? <Link href={c.href} className="hover:text-ink font-bold">{c.label}</Link> : <span className="text-ink font-bold">{c.label}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Unified header / hero — large title, short explanation, CTAs, status. */
export function IntelligenceHeader({
  emoji, eyebrow, title, subtitle, actions, status, hero = true,
}: {
  emoji?: string; eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode; status?: ReactNode; hero?: boolean;
}) {
  return (
    <header dir="rtl" className={cn("border-line relative overflow-hidden rounded-3xl border p-5 sm:p-6", hero ? "bg-card bg-gradient-to-bl from-brand-soft/50 to-transparent" : "bg-card")}>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {emoji && <span className="bg-brand-soft text-brand-strong grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl">{emoji}</span>}
          <div className="min-w-0">
            {eyebrow && <p className="text-brand text-[11px] font-black tracking-wide">{eyebrow}</p>}
            <h1 className="text-ink text-2xl font-black sm:text-3xl">{title}</h1>
            {subtitle && <p className="text-muted mt-1 max-w-2xl text-sm">{subtitle}</p>}
          </div>
        </div>
        {status}
      </div>
      {actions && <div className="relative mt-4">{actions}</div>}
    </header>
  );
}

/** Row of primary/secondary actions. */
export function IntelligenceActionBar({ children }: { children: ReactNode }) {
  return <div dir="rtl" className="flex flex-wrap gap-2">{children}</div>;
}

export function IntelligenceActionLink({ href, children, primary, prefetch = false }: { href: string; children: ReactNode; primary?: boolean; prefetch?: boolean }) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition",
        primary ? "bg-brand hover:bg-brand-strong text-white" : "border-line bg-card text-ink hover:border-brand-light border",
      )}
    >
      {children}
    </Link>
  );
}

/** Unified KPI grid + card. */
export function IntelligenceKpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}
export function IntelligenceKpi({ label, value, hint, accent, icon }: { label: string; value: string; hint?: string; accent?: boolean; icon?: ReactNode }) {
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      {icon && <span className="text-brand mb-1 inline-flex">{icon}</span>}
      <div className={cn("text-2xl font-black tabular-nums", accent ? "text-brand-strong" : "text-ink")}>{value}</div>
      <div className="text-muted mt-1 text-[11px] font-bold leading-tight">{label}</div>
      {hint && <div className="text-muted/80 mt-0.5 text-[10px]">{hint}</div>}
    </div>
  );
}

/** Unified internal tab bar. Active tab is passed explicitly (server-safe). */
export function IntelligenceTabs({ tabs, active }: { tabs: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div dir="rtl" className="border-line bg-card flex flex-wrap gap-1 rounded-2xl border p-1.5">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            prefetch={false}
            aria-current={on ? "page" : undefined}
            className={cn("rounded-xl px-3 py-1.5 text-sm font-bold whitespace-nowrap transition", on ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface hover:text-ink")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Unified section wrapper. */
export function IntelligenceSection({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-base font-black tracking-tight sm:text-lg">{title}</h2>
          {subtitle && <p className="text-muted mt-0.5 text-xs">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Unified card. */
export function IntelligenceCard({ title, description, footer, action, children, className }: { title?: string; description?: string; footer?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("border-line bg-card rounded-2xl border p-4", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-2">
          {title && <p className="text-ink text-sm font-black">{title}</p>}
          {action}
        </div>
      )}
      {description && <p className="text-muted mt-1 text-xs">{description}</p>}
      {children}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

/** Inline (small) empty placeholder for a section. */
export function IntelligenceEmptyInline({ text }: { text: string }) {
  return <div className="border-line text-muted rounded-xl border border-dashed p-5 text-center text-xs">{text}</div>;
}

export interface FeedItem { id: string; title: string; detail?: string; href?: string; badge?: ReactNode; meta?: string }
/** Unified chronological feed. */
export function IntelligenceFeed({ items, emptyText = "אין פריטים." }: { items: FeedItem[]; emptyText?: string }) {
  if (!items.length) return <IntelligenceEmptyInline text={emptyText} />;
  return (
    <div className="flex max-h-[64vh] flex-col overflow-y-auto">
      {items.map((f) => {
        const inner = (
          <span className="flex w-full flex-col gap-0.5">
            <span className="flex items-center justify-between gap-2">{f.badge}{f.meta && <span className="text-muted text-[10px]">{f.meta}</span>}</span>
            <span className="text-ink truncate text-xs font-bold">{f.title}</span>
            {f.detail && <span className="text-muted truncate text-[11px]">{f.detail}</span>}
          </span>
        );
        return f.href
          ? <Link key={f.id} href={f.href} prefetch={false} className="border-line/60 hover:bg-surface flex border-b py-2 transition last:border-0">{inner}</Link>
          : <div key={f.id} className="border-line/60 flex border-b py-2 last:border-0">{inner}</div>;
      })}
    </div>
  );
}

/**
 * Unified onboarding empty state — explains why there's no data, the next steps,
 * and offers the relevant actions. Defaults to the standard market flow.
 */
export function IntelligenceEmptyState({ title = "עדיין אין מספיק דאטה להצגה", steps, actions }: { title?: string; steps?: string[]; actions?: ReactNode }) {
  const s = steps ?? ["סנכרן נכסים חיצוניים", "רענן מערכת", "פתח את נכסי השוק"];
  return (
    <div dir="rtl" className="border-line bg-card rounded-2xl border border-dashed p-6 text-center">
      <span className="mb-2 block text-3xl" aria-hidden>🧭</span>
      <p className="text-ink text-sm font-black">{title}</p>
      <p className="text-muted mt-1 text-xs">כדי להתחיל:</p>
      <ol className="text-muted mx-auto mt-2 inline-flex list-inside list-decimal flex-col gap-0.5 text-right text-sm">
        {s.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {actions ?? (
          <>
            <IntelligenceActionLink href="/market-intelligence/listings" primary>🔄 סנכרן עכשיו</IntelligenceActionLink>
            <IntelligenceActionLink href="/market-intelligence/listings">🌍 נכסי השוק</IntelligenceActionLink>
            <IntelligenceActionLink href="/admin/system-health">⚙️ רענן מערכת</IntelligenceActionLink>
          </>
        )}
      </div>
    </div>
  );
}

/** Unified loading skeleton. */
export function IntelligenceLoadingState({ text = "טוען מודיעין…", rows = 3 }: { text?: string; rows?: number }) {
  return (
    <div dir="rtl" className="border-line bg-card flex flex-col gap-2 rounded-2xl border p-5">
      <p className="text-muted text-xs font-bold">{text}</p>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="bg-surface h-3 w-full animate-pulse rounded-full" />)}
    </div>
  );
}

/** Sidebar column wrapper (context / secondary panels). */
export function IntelligenceSidebar({ children }: { children: ReactNode }) {
  return <aside dir="rtl" className="flex flex-col gap-4">{children}</aside>;
}

export interface RelatedLink { label: string; href: string; meta?: string }
/** Global "Related Intelligence" footer — reuses existing relationships only. */
export function IntelligenceRelated({ groups }: { groups: { title: string; items: RelatedLink[] }[] }) {
  const visible = groups.filter((g) => g.items.length);
  if (!visible.length) return null;
  return (
    <IntelligenceSection title="מודיעין קשור" subtitle="מתווכים · משרדים · שכונות · מודעות · הזדמנויות — מתוך הקשרים הקיימים">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((g) => (
          <div key={g.title}>
            <p className="text-ink mb-1.5 text-xs font-black">{g.title}</p>
            <div className="flex flex-col">
              {g.items.slice(0, 6).map((it) => (
                <Link key={it.href + it.label} href={it.href} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-1.5 text-xs transition last:border-0">
                  <span className="text-ink truncate font-bold">{it.label}</span>
                  {it.meta && <span className="text-muted shrink-0">{it.meta}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </IntelligenceSection>
  );
}
