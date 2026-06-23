"use client";

// ============================================================================
// ZONO — Home (Command Center) view. Premium, RTL, light-theme command center.
// Composed from the named dashboard-home components; all UI labels resolve via
// the i18n dictionary and all data comes from the server-built DashboardHomeData
// (real properties woven into featured/hot/journey; the rest production-shaped).
// Reference layout order: hero → KPIs → today-attention → intelligence row →
// activity trend → hot properties → bottom intelligence grid → (preserved:
// journey + seller/buyer intel + competitor insights) → last activity. + AI FAB.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Reveal } from "@/components/dashboard/motion";
import { tr, type DashboardDict } from "@/lib/dashboard-home/i18n";
import type { DashboardHomeData } from "@/lib/dashboard-home/types";
import { DashboardHero, DashboardKpiStrip } from "./components/DashboardHero";
import { TodayAttentionSection } from "./components/TodayAttentionSection";
import { DashboardIntelligenceRow } from "./components/IntelligenceRow";
import { ActivityTrendStrip } from "./components/ActivityTrendStrip";
import { HotPropertiesSection } from "./components/HotPropertiesSection";
import { DashboardIntelligenceGrid } from "./components/DashboardIntelligenceGrid";
import { LastActivityTimeline } from "./components/LastActivityTimeline";
import { PropertyJourneySection, SellerBuyerIntelligence, CompetitorInsightsCard } from "./components/ExtraSections";

const FAB_ACTIONS: { l: string; i: string; h: string }[] = [
  { l: "aiActions.findSellers", i: "Home", h: "/sellers" },
  { l: "aiActions.findBuyers", i: "Users", h: "/buyers" },
  { l: "aiActions.analyzeNeighborhood", i: "MapPin", h: "/market" },
  { l: "aiActions.analyzeProperty", i: "Building2", h: "/properties" },
  { l: "aiActions.createCampaign", i: "Megaphone", h: "/creative" },
  { l: "aiActions.createPost", i: "Sparkles", h: "/creative" },
  { l: "aiActions.openOpportunities", i: "Target", h: "/command" },
];

export function DashboardHomeView({ dict, data }: { dict: DashboardDict; data: DashboardHomeData }) {
  const t = useMemo(() => (k: string) => tr(dict, k), [dict]);
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div dir="rtl" className="relative flex flex-col gap-12 sm:gap-14">
      {/* 1 — Hero + KPI strip */}
      <Reveal>
        <div className="flex flex-col gap-5">
          <DashboardHero t={t} data={data} />
          <DashboardKpiStrip t={t} kpis={data.kpis} />
        </div>
      </Reveal>

      {/* 2 — מה דורש טיפול היום? */}
      <TodayAttentionSection t={t} items={data.attention} />

      {/* 3 — Intelligence row: Radar · Heatmap · Urgent actions */}
      <DashboardIntelligenceRow t={t} data={data} />

      {/* 4 — Activity trend strip */}
      <ActivityTrendStrip t={t} data={data} />

      {/* 5 — נכסים חמים בשוק */}
      <HotPropertiesSection t={t} properties={data.hotProperties} />

      {/* 6 — Bottom intelligence grid: opportunities · ranking · mission control */}
      <DashboardIntelligenceGrid t={t} sellers={data.sellers} agents={data.competitors} missions={data.missions} dealProbabilityPct={data.dealProbabilityPct} />

      {/* 7 — Preserved: property journey kanban */}
      <PropertyJourneySection t={t} journey={data.journey} />

      {/* 8 — Preserved: seller + buyer intelligence */}
      <SellerBuyerIntelligence t={t} data={data} />

      {/* 9 — Preserved: competitor AI insights */}
      <CompetitorInsightsCard t={t} insightKeys={data.competitorInsightKeys} />

      {/* 10 — פעילות אחרונה */}
      <LastActivityTimeline t={t} activity={data.activity} />

      {/* AI floating action button */}
      <div className="fixed bottom-24 start-5 z-30 lg:bottom-8">
        {fabOpen && (
          <div className="bg-card border-line mb-3 flex w-56 flex-col gap-0.5 rounded-2xl border p-2 shadow-[var(--shadow-lift)]">
            {FAB_ACTIONS.map((a) => (
              <Link key={a.l} href={a.h} className="text-ink hover:bg-surface flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold transition-colors">
                <span className="text-brand-strong"><Icon name={a.i} size={15} /></span>{t(a.l)}
              </Link>
            ))}
          </div>
        )}
        <button onClick={() => setFabOpen((v) => !v)} className="zono-ai-gradient zono-focus-ring grid h-14 w-14 place-items-center rounded-full text-white" aria-label={t("aiActions.label")} aria-expanded={fabOpen}>
          <Icon name={fabOpen ? "X" : "Sparkles"} size={24} />
        </button>
      </div>
    </div>
  );
}
