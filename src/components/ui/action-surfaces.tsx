"use client";
// ============================================================================
// ZONO — Action-surface + iconography design system (global UX polish).
// One coherent set of premium primitives so screens stop hand-rolling tiny
// icons-in-pale-purple-squares. Reuses the existing <Icon> library + brand CSS
// tokens; adds size tiers, stroke weight, semantic accents, and purposeful
// surfaces (a wrapper only when it earns one). RTL-first, accessible, no schema
// / logic changes. Import these instead of bespoke card/icon markup.
// ============================================================================
import type { ReactNode } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

// ── Design tokens (§5/§6/§22) ────────────────────────────────────────────────
export const ICON_SIZE = { xs: 16, s: 20, m: 26, l: 34, xl: 48 } as const;
export type IconTier = keyof typeof ICON_SIZE;
// Heavier default stroke than the old 1.75 — important actions must not feel thin.
export const ICON_STROKE: Record<IconTier, number> = { xs: 2, s: 2, m: 2.1, l: 2.2, xl: 2.3 };

export type Accent = "brand" | "neutral" | "success" | "warn" | "info" | "danger";
// Semantic accent → { icon color, soft field bg, solid bg }. Purple stays core but
// isn't forced onto everything (§8).
const ACCENT: Record<Accent, { fg: string; soft: string; solid: string; ring: string }> = {
  brand:   { fg: "text-[var(--brand-strong,#6d28d9)]", soft: "bg-[var(--brand-soft,#f3f0ff)]", solid: "bg-[var(--brand,#6d28d9)] text-white", ring: "ring-[var(--brand,#6d28d9)]/25" },
  neutral: { fg: "text-ink",            soft: "bg-surface",     solid: "bg-ink text-white",       ring: "ring-line" },
  success: { fg: "text-emerald-600",    soft: "bg-emerald-50",  solid: "bg-emerald-600 text-white", ring: "ring-emerald-500/25" },
  warn:    { fg: "text-amber-600",      soft: "bg-amber-50",    solid: "bg-amber-500 text-white",  ring: "ring-amber-500/25" },
  info:    { fg: "text-sky-600",        soft: "bg-sky-50",      solid: "bg-sky-600 text-white",    ring: "ring-sky-500/25" },
  danger:  { fg: "text-red-600",        soft: "bg-red-50",      solid: "bg-red-600 text-white",    ring: "ring-red-500/25" },
};

export type SurfaceVariant = "bare" | "soft" | "solid" | "ring";

// ── IconSurface (§7) — an icon with a surface ONLY when it earns one ─────────
export function IconSurface({
  name, tier = "m", accent = "brand", variant = "soft", className,
}: { name: string; tier?: IconTier; accent?: Accent; variant?: SurfaceVariant; className?: string }) {
  const a = ACCENT[accent];
  const icon = <Icon name={name} size={ICON_SIZE[tier]} strokeWidth={ICON_STROKE[tier]} className={variant === "solid" ? "" : a.fg} />;
  if (variant === "bare") return <span className={className}>{icon}</span>;
  const pad = tier === "xl" ? "p-3.5" : tier === "l" ? "p-3" : "p-2.5";
  const radius = tier === "xl" || tier === "l" ? "rounded-2xl" : "rounded-xl";
  return (
    <span className={cn("inline-grid place-items-center", pad, radius,
      variant === "solid" ? a.solid : variant === "ring" ? cn("bg-card ring-1", a.ring) : a.soft, className)}>
      {icon}
    </span>
  );
}

// ── ActionCard (§3/§10) — a premium command launcher, icon leads meaning ─────
export function ActionCard({
  name, label, subtext, accent = "brand", shortcut, onClick, disabled, className,
}: { name: string; label: string; subtext?: string; accent?: Accent; shortcut?: string; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl border border-line bg-card p-4 text-right shadow-card transition-all",
        "hover:-translate-y-0.5 hover:border-transparent hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand,#6d28d9)]/40",
        disabled && "cursor-not-allowed opacity-55 hover:translate-y-0 hover:shadow-card", className)}
    >
      <IconSurface name={name} tier="l" accent={accent} variant="soft" className="transition-transform group-hover:scale-[1.06]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-ink truncate text-[15px] font-black">{label}</span>
          {shortcut && <kbd className="text-muted border-line hidden rounded border px-1.5 text-[10px] font-bold sm:inline">{shortcut}</kbd>}
        </span>
        {subtext && <span className="text-muted mt-0.5 block truncate text-xs">{subtext}</span>}
      </span>
      <Icon name="ChevronLeft" size={18} strokeWidth={2.2} className="text-muted transition-transform group-hover:-translate-x-0.5" />
    </button>
  );
}

/** 2×N responsive command grid (§10). */
export function ActionGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}

// ── KpiCard (§11) — number first, icon secondary, real drill-down ────────────
export function KpiCard({
  label, value, icon, accent = "brand", hint, onClick, className,
}: { label: string; value: string | number; icon?: string; accent?: Accent; hint?: string; onClick?: () => void; className?: string }) {
  const a = ACCENT[accent];
  const Comp: "button" | "div" = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { onClick, type: "button" as const } : {})}
      className={cn("group relative flex flex-col items-start rounded-2xl border border-line bg-card p-4 text-right shadow-card transition-all",
        onClick && "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand,#6d28d9)]/40", className)}>
      {icon && <Icon name={icon} size={ICON_SIZE.m} strokeWidth={ICON_STROKE.m} className={cn("absolute left-4 top-4 opacity-70", a.fg)} />}
      <span className="text-ink text-3xl font-black leading-none tracking-tight">{value}</span>
      <span className="text-muted mt-1.5 text-xs font-bold">{label}</span>
      {hint && <span className="text-muted/80 mt-1 text-[11px]">{hint}</span>}
    </Comp>
  );
}

// ── StatusBadge (§12) — scannable status symbol + surface ────────────────────
const STATUS: Record<string, { label: string; accent: Accent; icon: string }> = {
  ready:       { label: "מוכן",     accent: "success", icon: "CheckCircle" },
  success:     { label: "הושלם",    accent: "success", icon: "Check" },
  partial:     { label: "חלקי",     accent: "warn",    icon: "Circle" },
  building:    { label: "בתהליך",   accent: "info",    icon: "Activity" },
  warning:     { label: "לתשומת לב", accent: "warn",    icon: "AlertTriangle" },
  failed:      { label: "נכשל",     accent: "danger",  icon: "AlertCircle" },
  unavailable: { label: "לא זמין",  accent: "neutral", icon: "Circle" },
};
export function StatusBadge({ status, label, className }: { status: keyof typeof STATUS | string; label?: string; className?: string }) {
  const s = STATUS[status] ?? STATUS.unavailable;
  const a = ACCENT[s.accent];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold", a.soft, a.fg, "border-transparent", className)}>
      <Icon name={s.icon} size={14} strokeWidth={2.3} /> {label ?? s.label}
    </span>
  );
}

// ── EmptyStateVisual (§14) — large glyph, purpose, next action ────────────────
export function EmptyStateVisual({
  name, title, hint, accent = "brand", cta, className,
}: { name: string; title: string; hint?: string; accent?: Accent; cta?: ReactNode; className?: string }) {
  return (
    <div className={cn("border-line bg-card grid place-items-center rounded-2xl border border-dashed p-10 text-center shadow-card", className)}>
      <IconSurface name={name} tier="xl" accent={accent} variant="soft" className="mb-4" />
      <p className="text-ink text-base font-black">{title}</p>
      {hint && <p className="text-muted mt-1 max-w-md text-sm">{hint}</p>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
