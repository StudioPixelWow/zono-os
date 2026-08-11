// ============================================================================
// ZONO — PLATFORM ACCESS presentational UI (P5.4). Pure/client-safe: renders the
// pure resolver output (access matrix · effective access · drift). NO server
// imports, NO event handlers, NO mutation — SHADOW MODE is read-only.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { PLAN_LABEL } from "@/components/platform-admin/ui";
import type {
  AccessMatrixRow,
  EffectiveAccess,
  AccessSource,
  DriftEntry,
  DriftSummary,
} from "@/lib/platform-admin/access/model";
import type { PlanTier } from "@/lib/launch/types";

const CATEGORY_LABEL: Record<AccessMatrixRow["category"], string> = {
  crm: "CRM", marketing: "שיווק", communication: "תקשורת",
  intelligence: "מודיעין", websites: "אתרים", ai: "AI", platform: "פלטפורמה",
};

const SOURCE_LABEL: Record<AccessSource, string> = {
  base: "בסיס", plan_entitlement: "תוכנית", org_override: "override ארגוני", feature_flag: "דגל גלובלי",
};
const SOURCE_TONE: Record<AccessSource, string> = {
  base: "bg-surface text-muted", plan_entitlement: "bg-brand-soft text-brand",
  org_override: "bg-warning-soft text-warning", feature_flag: "bg-info-soft text-info",
};

/** features × plans entitlement grid (plan-alone; overrides shown separately). */
export function AccessMatrixTable({ rows, tiers }: { rows: AccessMatrixRow[]; tiers: PlanTier[] }) {
  // Precompute which rows start a new category (no render-time mutation — R19).
  const showCatByIndex = rows.map((r, i) => i === 0 || rows[i - 1]!.category !== r.category);
  return (
    <div className="border-line overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-line bg-surface border-b">
            <th className="text-muted px-3 py-2.5 text-start text-[12px] font-bold">יכולת</th>
            {tiers.map((t) => (
              <th key={t} className="text-ink px-3 py-2.5 text-center text-[12px] font-bold">{PLAN_LABEL[t] ?? t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const showCat = showCatByIndex[i];
            return (
              <tr key={r.feature} className="border-line border-b last:border-0">
                <td className="px-3 py-2.5">
                  {showCat && <div className="text-muted mb-0.5 text-[10px] font-bold uppercase tracking-wide">{CATEGORY_LABEL[r.category]}</div>}
                  <div className="text-ink font-semibold">{r.label}</div>
                  {r.entitlement && <div className="text-muted font-mono text-[10px]" dir="ltr">{r.entitlement}</div>}
                </td>
                {r.cells.map((c) => (
                  <td key={c.tier} className="px-3 py-2.5 text-center">
                    {c.entitled
                      ? <span className="text-success inline-flex"><Icon name="Check" size={16} /></span>
                      : <span className="text-muted/50 inline-flex"><Icon name="Minus" size={14} /></span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourceBadge({ source }: { source: AccessSource }) {
  return <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + SOURCE_TONE[source]}>{SOURCE_LABEL[source]}</span>;
}

/** Resolver output for ONE org: each feature, enabled/disabled + source + reason. */
export function EffectiveAccessList({ access }: { access: EffectiveAccess[] }) {
  return (
    <ul className="divide-line divide-y">
      {access.map((e) => (
        <li key={e.feature} className="flex items-center gap-3 px-1 py-2.5">
          <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + (e.enabled ? "bg-success" : "bg-muted/40")} />
          <div className="min-w-0 flex-1">
            <div className="text-ink text-[13px] font-semibold">{e.label}</div>
            <div className="text-muted truncate text-[11px]">{e.reason}</div>
          </div>
          <SourceBadge source={e.source} />
          <span className={"text-[11px] font-bold " + (e.enabled ? "text-success" : "text-muted")}>{e.enabled ? "פעיל" : "כבוי"}</span>
        </li>
      ))}
    </ul>
  );
}

const SEV_TONE: Record<DriftEntry["severity"], string> = {
  critical: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info", none: "bg-surface text-muted",
};
const SEV_LABEL: Record<DriftEntry["severity"], string> = {
  critical: "קריטי", warning: "אזהרה", info: "מידע", none: "תקין",
};

/** Compact severity summary strip for a drift set. */
export function DriftSummaryStrip({ summary }: { summary: DriftSummary }) {
  const cells: { k: DriftEntry["severity"]; n: number }[] = [
    { k: "critical", n: summary.critical }, { k: "warning", n: summary.warning },
    { k: "info", n: summary.info }, { k: "none", n: summary.none },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {cells.map(({ k, n }) => (
        <span key={k} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold " + SEV_TONE[k]}>
          {SEV_LABEL[k]}<span className="tabular-nums">{n}</span>
        </span>
      ))}
    </div>
  );
}

/** Drift rows where the resolver disagrees with today's always-on behavior. */
export function DriftList({ drift, hideNone = true }: { drift: DriftEntry[]; hideNone?: boolean }) {
  const rows = hideNone ? drift.filter((d) => d.severity !== "none") : drift;
  if (rows.length === 0) {
    return (
      <p className="text-muted flex items-center gap-2 px-1 py-4 text-[13px] font-semibold">
        <span className="text-success"><Icon name="Check" size={16} /></span>
        אין סטייה — כל היכולות תואמות להתנהגות הנוכחית
      </p>
    );
  }
  return (
    <ul className="divide-line divide-y">
      {rows.map((d) => (
        <li key={d.feature} className="flex items-center gap-3 px-1 py-2.5">
          <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + SEV_TONE[d.severity]}>{SEV_LABEL[d.severity]}</span>
          <div className="min-w-0 flex-1">
            <div className="text-ink text-[13px] font-semibold">{d.label}</div>
            <div className="text-muted truncate text-[11px]">{d.reason}</div>
          </div>
          <span className="text-muted text-[11px]" dir="ltr">
            {d.current ? "on" : "off"} → {d.resolved ? "on" : "off"}
          </span>
        </li>
      ))}
    </ul>
  );
}
