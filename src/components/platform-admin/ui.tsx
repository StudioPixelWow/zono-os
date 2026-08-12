// ============================================================================
// ZONO — Platform Admin shared UI primitives (P5.1). PURE / server-renderable
// (no "use client"). Premium control-plane look: light, dense, hairline
// dividers, minimal shadow — deliberately distinct from the lavender customer
// app so operators always know they are in the platform control plane.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { PlatformMetric } from "@/lib/platform-admin/server/dal";

export const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  team: "Team",
  enterprise: "Enterprise",
};

export const USER_STATUS_LABEL: Record<string, string> = {
  active: "פעיל",
  invited: "הוזמן",
  suspended: "מושהה",
  disabled: "מושבת",
};

export function formatPlatformDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

export function formatPlatformDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatPlatformDate(iso)} · ${hh}:${min}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Renders a metric honoring its state — a restricted/unavailable metric is
 *  NEVER shown as a real 0. */
export function MetricValue({ metric, className }: { metric: PlatformMetric; className?: string }) {
  if (metric.state === "ok" && metric.value !== null) {
    return <span className={className}>{formatNumber(metric.value)}</span>;
  }
  if (metric.state === "restricted") {
    return <span className={cn("text-muted inline-flex items-center gap-1 text-base font-bold", className)}><Icon name="Lock" size={13} />מוגבל</span>;
  }
  return <span className={cn("text-muted text-base font-bold", className)}>—</span>;
}

export function metricHint(metric: PlatformMetric): string | null {
  if (metric.state === "restricted") return "אין הרשאה למדד זה";
  if (metric.state === "unavailable") return "לא זמין כרגע";
  return null;
}

/** Primary KPI card. */
export function StatCard({ icon, label, metric, sub, tone = "brand" }: {
  icon: string; label: string; metric: PlatformMetric; sub?: string;
  tone?: "brand" | "neutral" | "success" | "warning";
}) {
  const toneCls: Record<string, string> = {
    brand: "text-brand bg-brand-soft",
    neutral: "text-muted bg-surface",
    success: "text-success bg-success-soft",
    warning: "text-warning bg-warning-soft",
  };
  const hint = metricHint(metric);
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", toneCls[tone])}><Icon name={icon} size={17} /></span>
        {sub ? <span className="text-muted text-[11px] font-semibold">{sub}</span> : null}
      </div>
      <p className="text-ink mt-3 text-3xl font-black tabular-nums leading-none"><MetricValue metric={metric} /></p>
      <p className="text-muted mt-1.5 text-[13px] font-semibold">{label}</p>
      {hint ? <p className="text-muted/80 mt-0.5 text-[11px]">{hint}</p> : null}
    </div>
  );
}

/** Compact usage tile (secondary metric strip). */
export function UsageTile({ icon, label, metric }: { icon: string; label: string; metric: PlatformMetric }) {
  return (
    <div className="border-line bg-card flex items-center gap-3 rounded-xl border p-3">
      <span className="text-muted bg-surface grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name={icon} size={15} /></span>
      <div className="min-w-0">
        <p className="text-ink text-lg font-black tabular-nums leading-none"><MetricValue metric={metric} /></p>
        <p className="text-muted mt-0.5 truncate text-[12px] font-semibold">{label}</p>
      </div>
    </div>
  );
}

/** Section container with title + optional action. */
export function PanelCard({ title, icon, action, children, className }: {
  title: string; icon?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("border-line bg-card rounded-2xl border", className)}>
      <header className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-ink inline-flex items-center gap-2 text-sm font-extrabold">
          {icon ? <span className="text-brand"><Icon name={icon} size={16} /></span> : null}
          {title}
        </h2>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function PlanBadge({ plan }: { plan: string | null }) {
  const label = plan ? (PLAN_LABEL[plan] ?? plan) : "—";
  return <span className="border-line text-muted inline-flex items-center rounded-md border bg-surface px-2 py-0.5 text-[11px] font-bold">{label}</span>;
}

export function StatusBadge({ status }: { status: string | null }) {
  const tone: Record<string, string> = {
    active: "bg-success-soft text-success",
    invited: "bg-warning-soft text-warning",
    suspended: "bg-danger-soft text-danger",
    disabled: "bg-surface text-muted",
  };
  const cls = (status && tone[status]) || "bg-surface text-muted";
  const label = (status && USER_STATUS_LABEL[status]) || status || "—";
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold", cls)}>{label}</span>;
}

/** Short mono id chip (first 8 chars) — safe org/user id surfacing. */
export function IdChip({ id }: { id: string }) {
  return <span className="text-muted/80 font-mono text-[11px]" dir="ltr">{id.slice(0, 8)}</span>;
}

export function PageHeader({ eyebrow, title, description, icon }: {
  eyebrow: string; title: string; description?: string; icon?: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {icon ? <span className="text-brand bg-brand-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={icon} size={20} /></span> : null}
      <div>
        <p className="text-brand text-[11px] font-bold tracking-wide">{eyebrow}</p>
        <h1 className="text-ink mt-0.5 text-2xl font-black">{title}</h1>
        {description ? <p className="text-muted mt-1 max-w-2xl text-sm">{description}</p> : null}
      </div>
    </div>
  );
}

export function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="border-line bg-card hover:border-brand-light flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold text-ink transition-colors">
      <span className="text-brand"><Icon name={icon} size={16} /></span>
      {label}
      <span className="text-muted ms-auto"><Icon name="ChevronLeft" size={15} /></span>
    </Link>
  );
}
