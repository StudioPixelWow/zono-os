"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";
import type { TerritoryCommandCenter, TerritoryRow, TerritorySignalRow, StreetTerritoryRow, BuildingClusterRow, TerritoryDnaRow } from "@/lib/territory/service";
import { generateTerritoriesAction } from "@/lib/territory/actions";

const LEVEL_TONE: Record<string, string> = {
  dominant: "text-success bg-success-soft", strong: "text-success bg-success-soft",
  watch: "text-warning bg-warning-soft", weak: "text-danger bg-danger-soft", critical: "text-danger bg-danger-soft",
};
const LEVEL_LABEL: Record<string, string> = { dominant: "שליטה", strong: "חזק", watch: "מעקב", weak: "חלש", critical: "קריטי" };
const SIGNAL_LABEL: Record<string, string> = {
  white_space: "שטח לבן", competitor_dominance: "שליטת מתחרים", growth_area: "אזור צומח", acquisition_hotspot: "מוקד גיוס",
  inventory_gap: "מחסור מלאי", buyer_cluster: "ריכוז קונים", seller_cluster: "ריכוז מוכרים", transaction_spike: "זינוק עסקאות",
  revenue_opportunity: "הזדמנות הכנסה", territory_decline: "דעיכה", agent_gap: "חוסר סוכן", office_gap: "חוסר משרד",
  recommendation_density: "צפיפות המלצות", market_shift: "שינוי שוק",
};
const fmt = (n: number) => n.toLocaleString("he-IL");
const fmtMoney = (n: number) => (n >= 1000 ? `₪${Math.round(n / 1000).toLocaleString("he-IL")}K` : `₪${fmt(n)}`);
const name = (t: TerritoryRow | null) => !t ? "—" : t.neighborhood_name ? `${t.city_name} · ${t.neighborhood_name}` : t.city_name ?? t.territory_key;

export function TerritoriesView({ cc }: { cc: TerritoryCommandCenter }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const generate = () => {
    setNote(null);
    startTransition(async () => {
      const r = await generateTerritoriesAction();
      setNote(r.error ?? r.message ?? null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Territory Intelligence OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין טריטוריות</h1>
          <p className="text-muted mt-1 text-sm">איפה לעבוד, איפה לגייס, איפה להתרחב — מבוסס עסקאות, מלאי, ביקוש ומתחרים. דטרמיניסטי ומוסבר.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cc.total > 0 && <span className="bg-card border-line text-muted inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold"><Icon name="Sparkles" size={13} className="text-brand" />{cc.graphNodes} בגרף</span>}
          {pending && <Spinner size={15} />}
          <Button onClick={generate} disabled={pending} leadingIcon={<Icon name="Map" size={16} />}>חשב טריטוריות</Button>
        </div>
      </div>

      {note && <p className="bg-card border-line text-ink rounded-xl border px-3 py-2 text-sm font-semibold">{note}</p>}
      {cc.lowConfidence > 0 && <p className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-sm font-semibold">⚠ {cc.lowConfidence} טריטוריות עם ביטחון נמוך — הוסף עסקאות/דאטה לאזורים אלו לדיוק רב יותר.</p>}

      {cc.total === 0 ? (
        <div className="bg-card border-line rounded-[20px] border p-6 text-center">
          <p className="text-muted text-sm">אין נתוני טריטוריות עדיין. לחץ ״חשב טריטוריות״ כדי לבנות על בסיס עסקאות, מלאי, קונים ומתחרים.</p>
        </div>
      ) : (
        <>
          {/* Command center KPIs */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="הטריטוריה החזקה" t={cc.strongest} metric="territory_health_score" tone="text-success" />
            <Kpi label="הצומחת ביותר" t={cc.fastestGrowing} metric="growth_score" tone="text-brand-strong" />
            <Kpi label="הכי רווחית" t={cc.highestRevenue} metric="revenue_score" tone="text-success" />
            <Kpi label="מוקד גיוס" t={cc.highestAcquisition} metric="acquisition_score" tone="text-brand-strong" />
            <Kpi label="האיום הגדול" t={cc.biggestThreat} metric="competition_score" tone="text-danger" />
            <Kpi label="ההזדמנות" t={cc.biggestOpportunity} metric="opportunity_score" tone="text-warning" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Section title="דירוג טריטוריות" icon="BarChart3">
              <TerritoryTable rows={cc.rankings} metric="opportunity_score" metricLabel="הזדמנות" />
            </Section>
            <Section title="שטחים לבנים (איפה לא עובדים מספיק)" icon="Map">
              <TerritoryTable rows={cc.whiteSpace} metric="white_space_score" metricLabel="שטח לבן" />
            </Section>
            <Section title="הזדמנויות הכנסה" icon="TrendingUp">
              <TerritoryTable rows={cc.revenueOps} metric="revenue_score" metricLabel="הכנסה" money />
            </Section>
            <Section title="שליטה בטריטוריה" icon="Shield">
              <TerritoryTable rows={cc.dominance} metric="dominance_score" metricLabel="שליטה" />
            </Section>
            <Section title="דירוג שכונות" icon="MapPin">
              <TerritoryTable rows={cc.neighborhoods} metric="opportunity_score" metricLabel="הזדמנות" />
            </Section>
            <Section title="סיגנלים טריטוריאליים" icon="Flame">
              {cc.signals.length === 0 ? <Empty /> : (
                <div className="flex flex-col gap-1.5">
                  {cc.signals.slice(0, 14).map((s) => <SignalRow key={s.id} s={s} />)}
                </div>
              )}
            </Section>
            <Section title="רחובות מומלצים (איזה רחוב שווה לכבוש)" icon="Route">
              <StreetTable rows={cc.streets} />
            </Section>
            <Section title="בנייני אשכול (הזדמנויות)" icon="Building2">
              <ClusterTable rows={cc.clusters} />
            </Section>
            <Section title="פערי כיסוי (אזור ללא סוכן)" icon="UserCheck">
              {cc.coverageGaps.length === 0 ? <Empty /> : (
                <TerritoryTable rows={cc.coverageGaps} metric="opportunity_score" metricLabel="הזדמנות" />
              )}
            </Section>
            <Section title="DNA טריטוריאלי" icon="Sparkles">
              {cc.dna.length === 0 ? <Empty /> : (
                <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                  {cc.dna.slice(0, 10).map((d) => <DnaRow key={d.id} d={d} />)}
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function StreetTable({ rows }: { rows: StreetTerritoryRow[] }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-right text-sm">
        <thead className="bg-surface text-muted sticky top-0 text-[11px] font-bold"><tr>{["רחוב", "הכנסה", "גיוס", "ביקוש", "עסקאות"].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-line border-t">
              <td className="text-ink px-2 py-1.5 font-semibold">{s.city_name} · {s.street}</td>
              <td className="text-brand-strong px-2 py-1.5 font-black">{s.revenue_opportunity}</td>
              <td className="text-muted px-2 py-1.5">{s.acquisition_opportunity}</td>
              <td className="text-muted px-2 py-1.5">{s.buyer_trend}</td>
              <td className="text-muted px-2 py-1.5">{s.transaction_count_365d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClusterTable({ rows }: { rows: BuildingClusterRow[] }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-right text-sm">
        <thead className="bg-surface text-muted sticky top-0 text-[11px] font-bold"><tr>{["בניין", "תחלופה", "משקיע", "רכש", "עסקאות"].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-line border-t">
              <td className="text-ink px-2 py-1.5 font-semibold">{c.city_name}{c.street ? ` · ${c.street}` : ""}</td>
              <td className="text-brand-strong px-2 py-1.5 font-black">{c.turnover_score}</td>
              <td className="text-muted px-2 py-1.5">{c.investor_score}</td>
              <td className="text-muted px-2 py-1.5">{c.acquisition_score}</td>
              <td className="text-muted px-2 py-1.5">{c.transaction_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DnaRow({ d }: { d: TerritoryDnaRow }) {
  return (
    <div className="border-line rounded-[14px] border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {d.strongest_property_type && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">נכס: {d.strongest_property_type}</span>}
        {d.strongest_buyer_type && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">קונה: {d.strongest_buyer_type}</span>}
        <span className="text-success text-[11px] font-bold">הכנסה {d.revenue_potential}</span>
        <span className="text-brand-strong text-[11px] font-bold">גיוס {d.acquisition_potential}</span>
      </div>
      {d.dna_summary_hebrew && <p className="text-muted mt-1 text-[12px]">{d.dna_summary_hebrew}</p>}
    </div>
  );
}

function Kpi({ label, t, metric, tone }: { label: string; t: TerritoryRow | null; metric: keyof TerritoryRow; tone: string }) {
  return (
    <div className="bg-card border-line rounded-[16px] border p-3">
      <p className="text-muted text-[10px] font-bold">{label}</p>
      <p className="text-ink mt-0.5 truncate text-sm font-extrabold">{name(t)}</p>
      <p className={cn("text-lg font-black", tone)}>{t ? (t[metric] as number) : 0}</p>
    </div>
  );
}

function TerritoryTable({ rows, metric, metricLabel, money }: { rows: TerritoryRow[]; metric: keyof TerritoryRow; metricLabel: string; money?: boolean }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-right text-sm">
        <thead className="bg-surface text-muted sticky top-0 text-[11px] font-bold"><tr>{["אזור", "רמה", metricLabel, "עסקאות 90י", "מלאי"].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-line border-t">
              <td className="text-ink px-2 py-1.5 font-semibold">{name(t)}</td>
              <td className="px-2 py-1.5"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", LEVEL_TONE[t.territory_level] ?? "bg-surface text-muted")}>{LEVEL_LABEL[t.territory_level] ?? t.territory_level}</span></td>
              <td className="text-brand-strong px-2 py-1.5 font-black">{money ? fmtMoney(t.expected_revenue) : (t[metric] as number)}</td>
              <td className="text-muted px-2 py-1.5">{t.transaction_volume_90d}</td>
              <td className="text-muted px-2 py-1.5">{t.internal_inventory}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalRow({ s }: { s: TerritorySignalRow }) {
  return (
    <div className="border-line border-b pb-1.5 last:border-0">
      <div className="flex items-center justify-between">
        <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{SIGNAL_LABEL[s.signal_type] ?? s.signal_type}</span>
        <span className="text-brand-strong text-sm font-black">{s.score}</span>
      </div>
      <p className="text-ink mt-1 text-[13px] font-bold">{s.title}</p>
      {s.recommended_action && <p className="text-brand-strong text-[12px] font-semibold">→ {s.recommended_action}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <p className="text-ink mb-3 flex items-center gap-1.5 text-sm font-extrabold"><Icon name={icon} size={16} className="text-brand" />{title}</p>
      {children}
    </div>
  );
}
function Empty() { return <p className="text-muted text-sm">אין נתונים עדיין.</p>; }
