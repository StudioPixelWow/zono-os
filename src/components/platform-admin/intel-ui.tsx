// ============================================================================
// ZONO — OWNER INTELLIGENCE presentational UI (P5.10). Pure/client-safe. Renders
// the deterministic management DTOs: activity/health chips, KPI blocks, the
// attention queue, feature adoption, AI-cost gap. NO fabricated data.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { ACTIVITY_LABEL, HEALTH_LABEL, type ActivityState, type HealthState } from "@/lib/platform-admin/intel/model";

const ACTIVITY_TONE: Record<ActivityState, string> = {
  ACTIVE: "bg-success-soft text-success", NEW: "bg-info-soft text-info",
  LOW_ACTIVITY: "bg-warning-soft text-warning", INACTIVE: "bg-danger-soft text-danger", UNKNOWN: "bg-surface text-muted",
};
export function ActivityChip({ state }: { state: ActivityState }) {
  return <span className={"inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold " + ACTIVITY_TONE[state]}>{ACTIVITY_LABEL[state]}</span>;
}

const HEALTH_TONE: Record<HealthState, string> = {
  HEALTHY: "bg-success-soft text-success", WATCH: "bg-info-soft text-info",
  AT_RISK: "bg-warning-soft text-warning", CRITICAL: "bg-danger-soft text-danger", UNKNOWN: "bg-surface text-muted",
};
export function HealthChip({ state }: { state: HealthState }) {
  return <span className={"inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold " + HEALTH_TONE[state]}>{HEALTH_LABEL[state]}</span>;
}

/** Owner KPI block — respects availability (unavailable → labeled, never fake 0). */
export function KpiBlock({ icon, label, value, available = true, money = false, tone = "brand", sub }: {
  icon: string; label: string; value: number | null; available?: boolean; money?: boolean; tone?: string; sub?: string;
}) {
  const toneCls: Record<string, string> = { brand: "text-brand bg-brand-soft", success: "text-success bg-success-soft", warning: "text-warning bg-warning-soft", danger: "text-danger bg-danger-soft", neutral: "text-muted bg-surface" };
  const fmt = (n: number) => money ? `₪${new Intl.NumberFormat("he-IL").format(n)}` : new Intl.NumberFormat("he-IL").format(n);
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <span className={"grid h-9 w-9 place-items-center rounded-xl " + (toneCls[tone] ?? toneCls.brand)}><Icon name={icon} size={17} /></span>
      <p className="text-ink mt-3 text-3xl font-black leading-none tabular-nums">{!available ? <span className="text-muted inline-flex items-center gap-1 text-base"><Icon name="Lock" size={13} />מוגבל</span> : value === null ? "—" : fmt(value)}</p>
      <p className="text-muted mt-1.5 text-[13px] font-semibold">{label}</p>
      {sub ? <p className="text-muted/70 mt-0.5 text-[11px]">{sub}</p> : null}
    </div>
  );
}

const SEV_TONE: Record<string, string> = { critical: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info" };
const SEV_LABEL: Record<string, string> = { critical: "קריטי", warning: "אזהרה", info: "מידע" };
export interface AttnItem { orgId: string; orgName: string | null; reason: string; source: string; severity: string; href: string }
export function AttentionList({ items }: { items: AttnItem[] }) {
  if (items.length === 0) return <p className="text-muted flex items-center gap-2 px-1 py-6 text-[13px] font-semibold"><span className="text-success"><Icon name="Check" size={16} /></span>אין פריטים הדורשים תשומת לב</p>;
  return (
    <ul className="divide-line divide-y">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-3 px-1 py-2.5">
          <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (SEV_TONE[it.severity] ?? SEV_TONE.info)}>{SEV_LABEL[it.severity] ?? it.severity}</span>
          <div className="min-w-0 flex-1">
            <Link href={it.href} className="text-ink hover:text-brand text-[13px] font-bold">{it.orgName ?? it.orgId.slice(0, 8)}</Link>
            <div className="text-muted text-[12px]">{it.reason}</div>
          </div>
          <span className="text-muted/70 text-[11px]">{it.source}</span>
        </li>
      ))}
    </ul>
  );
}

export interface AdoptRow { key: string; label: string; orgsUsing: number; totalOrgs: number }
export function AdoptionList({ rows }: { rows: AdoptRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = r.totalOrgs > 0 ? Math.round((r.orgsUsing / r.totalOrgs) * 100) : 0;
        return (
          <li key={r.key} className="flex items-center gap-3">
            <span className="text-ink w-28 shrink-0 text-[13px] font-semibold">{r.label}</span>
            <div className="bg-surface h-2.5 flex-1 overflow-hidden rounded-full">
              <div className="bg-brand h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-muted w-24 shrink-0 text-end text-[12px] tabular-nums">{r.orgsUsing}/{r.totalOrgs} ({pct}%)</span>
          </li>
        );
      })}
    </ul>
  );
}
