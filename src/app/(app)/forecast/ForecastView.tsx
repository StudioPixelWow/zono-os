"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recomputeForecastAction } from "@/lib/forecast/actions";
import type { ForecastBoard } from "@/lib/forecast/service";

const scoreTone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
type Agg = { key: string; name?: string; pwr: number; commission: number; count: number };

export function ForecastView({ board }: { board: ForecastBoard }) {
  const router = useRouter();
  const { snapshot, confidence, likely, atRisk, intervention, signals } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recalc = () => { setError(null); setMsg(null); start(async () => { const r = await recomputeForecastAction(); if (r.error) setError(r.error); else { setMsg(r.message ?? "חושב"); router.refresh(); } }); };

  const byAgent = (snapshot?.by_agent as Agg[] | null) ?? [];
  const byLocality = (snapshot?.by_locality as Agg[] | null) ?? [];
  const byType = (snapshot?.by_property_type as Agg[] | null) ?? [];
  const atRiskRevenue = atRisk.reduce((s, r) => s + r.probability_weighted_revenue, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Deal Forecast Engine</p>
          <h1 className="text-ink mt-1 text-2xl font-black">תחזית עסקאות</h1>
          <p className="text-muted mt-1 text-sm">מה צפוי להיסגר, כמה הכנסה צפויה, מה בסיכון ואיזו פעולה תגדיל את סיכויי הסגירה.</p>
        </div>
        <Button onClick={recalc} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב תחזית"}</Button>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Command center */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="הכנסה משוקללת" value={snapshot ? formatShekels(snapshot.probability_weighted_revenue) : "—"} icon="TrendingUp" tone="text-success" />
        <Stat label="עמלה צפויה" value={snapshot ? formatShekels(snapshot.expected_commission) : "—"} icon="BarChart3" />
        <Stat label="צנרת מלאה" value={snapshot ? formatShekels(snapshot.total_pipeline_value) : "—"} icon="Building2" />
        <Stat label="סגירות 30 יום" value={String(snapshot?.expected_closes_30d ?? 0)} icon="Clock" tone="text-brand-strong" />
        <Stat label="הכנסה בסיכון" value={formatShekels(atRiskRevenue)} icon="AlertTriangle" tone="text-danger" />
        <Stat label="ביטחון תחזית" value={`${confidence}%`} icon="Shield" />
      </div>

      {likely.length === 0 && atRisk.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="TrendingUp" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין תחזית</p>
          <p className="text-muted max-w-sm text-sm">ודא שיש התאמות פעילות ולחץ ״חשב תחזית״ כדי לבנות את צנרת ההכנסות.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ForecastList title="עסקאות צפויות להיסגר" rows={likely} metric="closing_probability" suffix="%" />
          <ForecastList title="עסקאות בסיכון" rows={atRisk} metric="deal_risk_score" suffix="" danger />

          <RevenuePanel title="הכנסה לפי סוכן" items={byAgent} nameKey />
          <RevenuePanel title="הכנסה לפי אזור" items={byLocality} />
          <RevenuePanel title="הכנסה לפי סוג נכס" items={byType} />

          <div className="bg-card border-line rounded-[20px] border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">דורש התערבות</p>
            {intervention.length === 0 ? <p className="text-muted text-sm">אין עסקאות הדורשות התערבות ✓</p> : (
              <ul className="flex flex-col gap-2">
                {intervention.map((r) => (
                  <li key={r.id} className="border-line rounded-xl border p-2 text-sm">
                    <p className="text-ink font-semibold">{r.locality ?? "עסקה"} · {formatShekels(r.probability_weighted_revenue)}</p>
                    <p className="text-muted text-[11px]">{r.primary_blocker ? `חסם: ${r.primary_blocker} · ` : ""}{r.next_best_action}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-card border-line rounded-[20px] border p-4 lg:col-span-2">
            <p className="text-ink mb-2 text-sm font-extrabold">סיגנלים תחזיתיים</p>
            {signals.length === 0 ? <p className="text-muted text-sm">אין סיגנלים</p> : (
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {signals.slice(0, 12).map((s) => (
                  <li key={s.id} className="border-line border-b py-1.5 last:border-0 text-sm">
                    <span className={cn("font-semibold", s.signal_type.includes("risk") || s.signal_type.includes("intervention") ? "text-danger" : "text-ink")}>{s.title}</span>
                    <span className="text-muted text-[11px]"> · {s.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ForecastList({ title, rows, metric, suffix, danger }: { title: string; rows: ForecastBoard["likely"]; metric: "closing_probability" | "deal_risk_score"; suffix: string; danger?: boolean }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <p className="text-ink mb-2 text-sm font-extrabold">{title}</p>
      {rows.length === 0 ? <p className="text-muted text-sm">—</p> : (
        <ul className="flex flex-col gap-1.5">
          {rows.slice(0, 10).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink min-w-0 flex-1 truncate font-semibold">{r.locality ?? "עסקה"} {r.property_type ? `· ${r.property_type}` : ""}</span>
              <span className="text-success text-[11px]">{formatShekels(r.probability_weighted_revenue)}</span>
              <span className="text-muted text-[11px]">{fmtDate(r.expected_close_date)}</span>
              <span className={cn("shrink-0 text-sm font-black", danger ? "text-danger" : scoreTone(r[metric]))}>{r[metric]}{suffix}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevenuePanel({ title, items, nameKey }: { title: string; items: Agg[]; nameKey?: boolean }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <p className="text-ink mb-2 text-sm font-extrabold">{title}</p>
      {items.length === 0 ? <p className="text-muted text-sm">—</p> : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 8).map((a) => (
            <li key={a.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink min-w-0 flex-1 truncate font-semibold">{nameKey ? a.name ?? a.key : a.key}</span>
              <span className="text-muted text-[11px]">{a.count} עסקאות</span>
              <span className="text-success shrink-0 text-[11px] font-bold">{formatShekels(a.pwr)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: string; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
