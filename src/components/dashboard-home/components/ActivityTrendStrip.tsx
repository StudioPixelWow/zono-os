"use client";

import { Icon } from "@/components/dashboard/Icon";
import type { DashboardHomeData } from "@/lib/dashboard-home/types";
import { Sparkline, ils, ilsC, type Translate } from "./shared";

/** Wide operational-metrics strip with a mini trend chart on the side. Values
 *  come from the existing dashboard DTO (city snapshot + KPIs + market trends). */
export function ActivityTrendStrip({ t, data }: { t: Translate; data: DashboardHomeData }) {
  const inMarketing = data.marketTrends.find((m) => m.labelKey === "trend.inventory")?.current
    ?? String(data.cityNow.newListings);
  const activeDeals = data.kpis.find((k) => k.labelKey === "kpi.activeDeals")?.value ?? "—";
  const newLeads = data.kpis.find((k) => k.labelKey === "kpi.newLeadsWeek")?.value ?? "—";

  const metrics = [
    { l: t("activityTrend.avgPrice"), v: ils(data.cityNow.avgPricePerSqm) },
    { l: t("activityTrend.dealVolume"), v: ilsC(data.cityNow.topTransaction) },
    { l: t("activityTrend.inMarketing"), v: inMarketing },
    { l: t("activityTrend.activeDeals"), v: activeDeals },
    { l: t("activityTrend.newLeads"), v: newLeads },
  ];

  return (
    <div className="bg-card border-line grid grid-cols-1 gap-4 rounded-[22px] border p-5 shadow-[var(--shadow-card)] lg:grid-cols-[1fr_220px]">
      <div className="flex flex-col gap-3">
        <h3 className="text-ink text-base font-black">{t("activityTrend.title")}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => (
            <div key={m.l} className="bg-surface rounded-xl p-3">
              <p className="text-muted text-[11px] font-bold">{m.l}</p>
              <p className="text-ink text-lg font-black">{m.v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="border-line bg-surface/50 flex flex-col justify-center gap-1 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted text-[11px] font-bold">{t("activityTrend.trend")}</span>
          <span className="text-success inline-flex items-center gap-1 text-sm font-black">
            <Icon name="TrendingUp" size={14} />+{data.cityNow.demandTrendPct}%
          </span>
        </div>
        <Sparkline points={[0.32, 0.4, 0.46, 0.5, 0.58, 0.66, 0.74]} tone="success" className="h-12" />
        <p className="text-muted text-[10px]">{t("heatMap.last30")}</p>
      </div>
    </div>
  );
}
