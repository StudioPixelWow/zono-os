"use client";
// ============================================================================
// ZONO — ContextualZeroState (P9.0B). One premium empty-state primitive for
// every customer-facing module. A zero-state must carry (1) context, (2) the
// value unlocked by acting, and (3) ONE clear primary CTA that really works —
// never a decorative empty box, never a CTA that no-ops for a fresh office.
// Honest-data contract: this renders when data is genuinely zero; it does not
// fabricate rows.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";

export interface ContextualZeroStateProps {
  icon?: string;
  title: string;
  /** The value the office unlocks by taking the action. */
  value?: string;
  cta: string;
  /** Provide a real route… */
  href?: string;
  /** …or a real client action (e.g. open Quick-Create). One of href/onClick is required. */
  onCta?: () => void;
  /** Optional secondary link. */
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
}

export function ContextualZeroState({
  icon = "Sparkles", title, value, cta, href, onCta, secondaryLabel, secondaryHref, className,
}: ContextualZeroStateProps) {
  const primary = (
    <span className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold"
      style={{ background: "var(--office-accent,#7c3aed)", color: "var(--office-accent-ink,#fff)" }}>
      <Icon name="Plus" className="h-4 w-4" /> {cta}
    </span>
  );
  return (
    <div dir="rtl" className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface-soft px-6 py-10 text-center ${className ?? ""}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--office-accent-strong,#6d28d9)] shadow-card">
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <div className="max-w-md">
        <p className="text-base font-bold text-ink">{title}</p>
        {value && <p className="mt-1 text-sm leading-relaxed text-muted">{value}</p>}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {href ? <Link href={href}>{primary}</Link> : <button type="button" onClick={onCta}>{primary}</button>}
        {secondaryLabel && secondaryHref && (
          <Link href={secondaryHref} className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
