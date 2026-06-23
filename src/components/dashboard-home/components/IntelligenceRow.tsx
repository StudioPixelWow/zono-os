"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type {
  DashboardHomeData, HeatMapMetric, HeatMapZone, MissionTask, OpportunitySignal,
} from "@/lib/dashboard-home/types";
import { Delta, TONE_BG, ils, ilsC, type Translate } from "./shared";

/* ── A. AI Opportunity Radar (compact list) ──────────────────────────────── */
export function AiOpportunityRadar({ t, opportunities }: { t: Translate; opportunities: OpportunitySignal[] }) {
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-base font-black">{t("opportunity.title")}</h3>
        <Link href="/command" className="text-brand-strong text-xs font-bold">{t("opportunity.openAll")}</Link>
      </div>
      <div className="flex flex-col gap-1.5">
        {opportunities.map((o) => (
          <Link key={o.id} href={o.href} className="hover:bg-surface group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors">
            <span className="bg-brand-soft text-brand-strong grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-black">{o.count}</span>
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-sm font-bold">{t("opportunity.kind." + o.kind)}</p>
              <p className="text-muted truncate text-[11px]">{t(o.reasonKey)}</p>
            </div>
            <Icon name="ChevronLeft" size={16} className="text-muted group-hover:text-brand-strong shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── B. City heat map ─────────────────────────────────────────────────────── */
const METRICS: HeatMapMetric[] = ["price_per_sqm", "buyer_demand", "rental_demand", "new_listings", "recent_transactions", "price_drops"];

function NeighborhoodInsightDrawer({ t, zone, onClose }: { t: Translate; zone: HeatMapZone; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex justify-start">
      <div className="bg-ink/20 absolute inset-0" onClick={onClose} aria-hidden />
      <div className="bg-card relative h-full w-full max-w-sm overflow-y-auto p-5 shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between">
          <h3 className="text-ink text-lg font-black">{zone.name}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label={t("heatMap.drawer.close")}><Icon name="X" size={18} /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { l: t("heatMap.drawer.avgPrice"), v: ilsC(zone.avgPrice) },
            { l: t("heatMap.drawer.pricePerSqm"), v: ils(zone.pricePerSqm) },
            { l: t("heatMap.drawer.activeProperties"), v: String(zone.activeProperties) },
            { l: t("heatMap.drawer.recentTransactions"), v: String(zone.recentTransactions) },
          ].map((s) => (
            <div key={s.l} className="bg-surface rounded-xl p-3"><p className="text-muted text-[11px] font-bold">{s.l}</p><p className="text-ink text-base font-black">{s.v}</p></div>
          ))}
        </div>
        <div className="bg-surface mt-3 flex items-center justify-between rounded-xl p-3">
          <span className="text-muted text-[11px] font-bold">{t("heatMap.drawer.trend30")}</span>
          <Delta pct={zone.deltaPct} trend={zone.deltaPct >= 0 ? "up" : "down"} />
        </div>
        <div className="mt-3">
          <p className="text-muted text-[11px] font-bold">{t("heatMap.drawer.topCompetitors")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{zone.topCompetitors.map((c) => <span key={c} className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{c}</span>)}</div>
        </div>
        <div className="bg-brand-soft mt-4 rounded-xl p-3">
          <p className="text-brand-strong inline-flex items-center gap-1 text-[11px] font-black"><Icon name="Sparkles" size={13} />{t("heatMap.drawer.aiInsight")}</p>
          <p className="text-ink mt-1 text-sm">{t(zone.aiInsightKey)}</p>
        </div>
        <Link href="/market" className="bg-brand mt-3 block rounded-xl px-3 py-2.5 text-center text-sm font-bold text-white">{t(zone.recommendedActionKey)}</Link>
      </div>
    </div>
  );
}

export function CityHeatmapCard({ t, data }: { t: Translate; data: DashboardHomeData }) {
  const [metric, setMetric] = useState<HeatMapMetric>("price_per_sqm");
  const [zone, setZone] = useState<HeatMapZone | null>(null);
  return (
    <div className="bg-card border-line relative flex flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
      <div className="border-line flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-ink text-base font-black">{t("heatMap.title")}</h3>
        <span className="text-success text-sm font-black">+{data.cityTrendPct}%</span>
      </div>
      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_150px]">
        <div className="relative aspect-[16/11]">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-100 via-surface to-success-soft/50" />
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(var(--color-line) 1px,transparent 1px),linear-gradient(90deg,var(--color-line) 1px,transparent 1px)", backgroundSize: "44px 44px", opacity: 0.4 }} />
          {data.heatZones.map((z) => (
            <button key={z.id} onClick={() => setZone(z)} className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer" style={{ top: `${z.top}%`, insetInlineStart: `${z.left}%` }} aria-label={z.name}>
              <span className={cn("absolute -inset-6 rounded-full opacity-25 blur-xl", TONE_BG[z.tone])} style={{ width: z.radius, height: z.radius, insetInlineStart: -z.radius / 2, top: -z.radius / 2 }} />
              <span className="bg-card border-line text-ink relative inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-black shadow-[var(--shadow-soft)]">
                {z.name}<span className={cn(z.deltaPct >= 0 ? "text-success" : "text-danger")}>{z.deltaPct >= 0 ? "+" : ""}{z.deltaPct}%</span>
              </span>
            </button>
          ))}
          {zone && <NeighborhoodInsightDrawer t={t} zone={zone} onClose={() => setZone(null)} />}
        </div>
        <div className="border-line flex flex-col gap-1 border-t p-3 lg:border-s lg:border-t-0">
          {METRICS.map((m) => (
            <button key={m} onClick={() => setMetric(m)} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[12px] font-bold transition-colors", metric === m ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface")}>
              <span className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2", metric === m ? "border-brand" : "border-line")}>{metric === m && <span className="bg-brand h-1.5 w-1.5 rounded-full" />}</span>
              <span className="truncate">{t("heatMap.metric." + m)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── C. Urgent actions ────────────────────────────────────────────────────── */
export function UrgentActionsCard({ t, missions }: { t: Translate; missions: MissionTask[] }) {
  const open = missions.filter((m) => !m.done);
  const list = (open.length ? open : missions).slice(0, 5);
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-base font-black">{t("urgentActions.title")}</h3>
        <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[11px] font-black">{open.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {list.map((m) => (
          <div key={m.id} className="hover:bg-surface flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors">
            <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name={m.icon} size={14} /></span>
            <span className="text-ink flex-1 truncate text-[13px] font-bold">{t(m.labelKey)}</span>
            {m.time && <span className="text-muted shrink-0 text-[11px] font-bold">{m.time}</span>}
          </div>
        ))}
      </div>
      <Link href="/tasks" className="bg-brand-soft text-brand-strong mt-auto rounded-xl px-3 py-2.5 text-center text-sm font-bold">{t("urgentActions.viewAll")}</Link>
    </div>
  );
}

/** The 3-card intelligence row: Radar · Heatmap · Urgent actions. */
export function DashboardIntelligenceRow({ t, data }: { t: Translate; data: DashboardHomeData }) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr_1fr]">
      <AiOpportunityRadar t={t} opportunities={data.opportunities} />
      <CityHeatmapCard t={t} data={data} />
      <UrgentActionsCard t={t} missions={data.missions} />
    </section>
  );
}
