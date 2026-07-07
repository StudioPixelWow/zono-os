// ============================================================================
// 🧩 ZONO Website Design System™ — layout primitives (server-safe). 38.1.
// SiteSection (consistent rhythm + eyebrow/title/subtitle), StatBand, and
// EmptyState/Skeleton. Official ZONO tokens only — no bespoke colors, so every
// site section shares the same spacing, type scale, glass and shadows.
// ============================================================================
import type { ReactNode } from "react";

/** Consistent section wrapper: vertical rhythm + optional heading block. */
export function SiteSection({ id, eyebrow, title, subtitle, action, children, className = "" }: {
  id?: string; eyebrow?: string; title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 py-8 sm:py-10 ${className}`}>
      {(eyebrow || title || subtitle) && (
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            {eyebrow && <p className="text-brand text-[12px] font-black tracking-wide">{eyebrow}</p>}
            {title && <h2 className="text-ink mt-0.5 text-2xl font-black tracking-tight sm:text-[26px]">{title}</h2>}
            {subtitle && <p className="text-muted mt-1 max-w-2xl text-[14px]">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Premium stat band — evidence numbers; value tinted with the active theme. */
export function StatBand({ stats }: { stats: { label: string; value: string }[] }) {
  if (!stats.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-card/90 border-line rounded-[var(--radius-card)] border px-4 py-4 text-center shadow-[var(--shadow-card)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
          <div className="text-2xl font-black tracking-tight sm:text-3xl" style={{ color: "var(--site-accent)" }}>{s.value}</div>
          <div className="text-muted mt-1 text-[12px] font-bold">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Premium empty state — never fabricates content, but never feels dead either.
 * A themed halo + glass card, a large iconic mark, and an optional action so a
 * missing section (e.g. "no sold listings yet") still looks intentional.
 */
export function SiteEmptyState({ icon = "✨", title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="bg-card/90 border-line relative overflow-hidden rounded-[var(--radius-card)] border p-12 text-center shadow-[var(--shadow-card)] backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 -top-16 mx-auto h-40 w-40 rounded-full opacity-20 blur-3xl" style={{ background: "var(--site-gradient)" }} />
      <div className="relative">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl text-white shadow-[var(--shadow-soft)]" style={{ background: "var(--site-gradient)" }}>{icon}</div>
        <p className="text-ink mt-4 text-lg font-black">{title}</p>
        {hint && <p className="text-muted mx-auto mt-1 max-w-md text-sm leading-relaxed">{hint}</p>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

/** Skeleton block for streaming/lazy sections (Part 17). */
export function SiteSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`bg-card border-line rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] ${className}`} aria-busy="true" aria-label="טוען">
      <div className="bg-brand-soft h-4 w-1/3 animate-pulse rounded-full" />
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="bg-surface mt-3 h-3 w-full animate-pulse rounded-full" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}
