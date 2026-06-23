"use client";

// ============================================================================
// ZONO — מרכז הפצה (Facebook Distribution Center) shared UI primitives.
// Glassmorphism + purple-gradient design language over the lavender app surface.
// ============================================================================
import type { ReactNode } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

// ── Formatting ───────────────────────────────────────────────────────────────
export const nfmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("he-IL");
export const pct = (n: number | null | undefined) => `${Math.round(n ?? 0)}%`;
export function compact(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(v));
}
export const ils = (n: number | null | undefined) => `₪${nfmt(Math.round(n ?? 0))}`;

// ── Score tones ────────────────────────────────────────────────────────────
export type Tone = "success" | "warning" | "danger" | "brand";
export function scoreTone(n: number): Tone {
  if (n >= 75) return "success";
  if (n >= 50) return "brand";
  if (n >= 30) return "warning";
  return "danger";
}
export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  brand: "text-brand-strong",
};
export const TONE_BAR: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  brand: "bg-brand",
};

// ── Glass surface ────────────────────────────────────────────────────────────
export function Glass({
  children,
  className,
  onClick,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "zono-glass rounded-[24px]",
        interactive && "hover:shadow-[var(--shadow-lift)] cursor-pointer transition-shadow",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Stat tile (KPI) ──────────────────────────────────────────────────────────
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: string;
  tone?: "brand" | "success" | "warning" | "danger" | "accent";
  delay?: number;
}) {
  const tones: Record<string, { wrap: string; val: string }> = {
    brand: { wrap: "bg-brand-soft text-brand", val: "text-brand-strong" },
    success: { wrap: "bg-success-soft text-success", val: "text-success" },
    warning: { wrap: "bg-warning-soft text-warning", val: "text-warning" },
    danger: { wrap: "bg-danger-soft text-danger", val: "text-danger" },
    accent: { wrap: "bg-sky-100 text-sky-700", val: "text-sky-700" },
  };
  const t = tones[tone];
  void delay;
  return (
    <Glass className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", t.wrap)}>
          <Icon name={icon} size={19} />
        </span>
        <span className={cn("text-3xl font-black tabular-nums", t.val)}>{value}</span>
      </div>
      <div>
        <p className="text-ink text-sm font-extrabold">{label}</p>
        {hint && <p className="text-muted text-[11px] font-medium">{hint}</p>}
      </div>
    </Glass>
  );
}

// ── Section heading ──────────────────────────────────────────────────────────
export function SectionHeading({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="zono-ai-gradient grid h-9 w-9 place-items-center rounded-xl text-white">
            <Icon name={icon} size={17} />
          </span>
        )}
        <div>
          <h2 className="text-ink text-lg font-black">{title}</h2>
          {subtitle && <p className="text-muted text-xs font-medium">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ── Score bar ────────────────────────────────────────────────────────────────
export function ScoreBar({ value, width = "w-16" }: { value: number; width?: string }) {
  const tone = scoreTone(value);
  return (
    <div className="flex items-center gap-2">
      <div className={cn("bg-line/70 h-1.5 overflow-hidden rounded-full", width)}>
        <div className={cn("h-full rounded-full", TONE_BAR[tone])} style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
      </div>
      <span className={cn("text-xs font-bold tabular-nums", TONE_TEXT[tone])}>{Math.round(value)}</span>
    </div>
  );
}

// ── Chip / pill ──────────────────────────────────────────────────────────────
export function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition",
        active ? "zono-gradient text-white shadow-[var(--shadow-soft)]" : "zono-glass text-ink hover:text-brand-strong",
      )}
    >
      {children}
      {count != null && (
        <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/25" : "bg-brand-soft text-brand-strong")}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Empty state (honest, no fake data) ─────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="zono-glass flex flex-col items-center gap-3 rounded-[24px] px-6 py-14 text-center">
      <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl">
        <Icon name={icon} size={26} />
      </span>
      <p className="text-ink text-lg font-extrabold">{title}</p>
      <p className="text-muted max-w-md text-sm">{body}</p>
      {action}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50",
        on ? "zono-gradient" : "bg-line",
      )}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-0.5" : "right-0.5")} />
    </button>
  );
}

export { Icon };
