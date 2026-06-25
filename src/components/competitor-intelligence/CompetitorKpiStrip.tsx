"use client";
import { Building2, Plus, TrendingDown, Flame, PieChart, Eye } from "lucide-react";
import type { CompetitorKpis } from "@/lib/competitor-intelligence/types";

const CONF: Record<string, string> = { high: "ודאות גבוהה", medium: "ודאות בינונית", low: "ודאות נמוכה" };

export function CompetitorKpiStrip({ kpis }: { kpis: CompetitorKpis }) {
  const cards = [
    { icon: <Building2 size={14} />, label: "מתחרים במעקב", value: kpis.trackedCompetitors, sub: `${kpis.competitorActiveListings} מודעות פעילות` },
    { icon: <Plus size={14} />, label: "מודעות חדשות היום", value: kpis.newCompetitorListingsToday, sub: "של מתחרים" },
    { icon: <TrendingDown size={14} />, label: "ירידות מחיר היום", value: kpis.competitorPriceDropsToday, sub: "של מתחרים" },
    { icon: <Flame size={14} />, label: "אזורים מתחממים", value: kpis.heatingAreas, sub: "במגמת עלייה" },
    { icon: <PieChart size={14} />, label: "נתח השוק שלי", value: `${kpis.ourEstimatedSharePercent}%`, sub: `הערכה · ${CONF[kpis.ourShareConfidence]}` },
    { icon: <Eye size={14} />, label: "מודעות במעקב", value: kpis.monitoredActiveListings, sub: "סך השוק שנאסף" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c, i) => (
        <div key={i} className="flex flex-col items-start rounded-2xl border border-black/5 bg-white p-2.5">
          <span className="flex items-center gap-1 text-[10px] font-bold text-ink/55">{c.icon} {c.label}</span>
          <span className="text-lg font-black text-brand-strong">{c.value}</span>
          <span className="text-[9px] font-medium text-ink/35">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}
