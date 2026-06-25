"use client";
// ============================================================================
// ZONO — Competitor Intelligence™ & Market Share Radar (Phase 17). Client
// orchestrator over PUBLIC market data already collected by Property Radar. All
// share figures are labeled estimates; private listings are never shown as
// competitors. Honest empty states throughout.
// ============================================================================
import { useCallback, useState, useTransition } from "react";
import { RefreshCw, Radar, Layers } from "lucide-react";
import { getCompetitorDashboardAction, runCompetitorSnapshotAction } from "@/lib/competitor-intelligence/actions";
import type { CompetitorDashboard } from "@/lib/competitor-intelligence/types";
import { CompetitorKpiStrip } from "./CompetitorKpiStrip";
import { CompetitorOfficeTable } from "./CompetitorOfficeTable";
import { CompetitorMarketMap } from "./CompetitorMarketMap";
import { CompetitorTrendPanel } from "./CompetitorTrendPanel";
import { CompetitorPriceDropBoard } from "./CompetitorPriceDropBoard";
import { CompetitorAreaBreakdown } from "./CompetitorAreaBreakdown";
import { CompetitorAlertsPanel } from "./CompetitorAlertsPanel";
import { CompetitorComparisonPanel } from "./CompetitorComparisonPanel";

export function CompetitorIntelligencePage({ initial }: { initial: CompetitorDashboard }) {
  const [data, setData] = useState<CompetitorDashboard>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [snapping, start] = useTransition();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const res = await getCompetitorDashboardAction();
    if (res.ok) setData(res.data);
    setRefreshing(false);
  }, []);

  const runSnapshot = () => start(async () => { await runCompetitorSnapshotAction(); await refresh(); });
  const updatedAt = new Date(data.generatedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4">
      {/* Executive summary */}
      <section className="zono-gradient relative overflow-hidden rounded-[20px] p-5 text-white">
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-white/80"><Radar size={16} /> מודיעין מתחרים ורדאר נתח שוק</p>
            <h1 className="mt-1 text-2xl font-black">מי פעיל סביבך — ומה זה אומר עליך</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-white/60">עודכן {updatedAt}</span>
            <button onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-2 text-[12px] font-black text-white hover:bg-white/30"><RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> רענן</button>
            <button onClick={runSnapshot} disabled={snapping} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-2 text-[12px] font-black text-white hover:bg-white/30 disabled:opacity-50"><Layers size={13} /> {snapping ? "מנתח…" : "צילום יומי"}</button>
          </div>
        </div>
        <ul className="relative mt-3 flex flex-col gap-1.5">
          {data.summary.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm font-semibold text-white/95"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />{s}</li>
          ))}
        </ul>
        <p className="relative mt-3 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80">כל הנתונים מבוססים על מודעות ציבוריות שנאספו ע״י Property Radar. נתחי שוק הם הערכה — לא נתון רשמי.</p>
      </section>

      <CompetitorKpiStrip kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CompetitorOfficeTable competitors={data.competitors} />
        <CompetitorTrendPanel areaTrends={data.areaTrends} />
      </div>

      <CompetitorAreaBreakdown competitors={data.competitors} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CompetitorPriceDropBoard priceDrops={data.priceDrops} />
        <CompetitorAlertsPanel alerts={data.alerts} onChanged={() => void refresh()} />
      </div>

      <CompetitorMarketMap points={data.mapPoints} />

      <CompetitorComparisonPanel comparison={data.comparison} />
    </div>
  );
}
