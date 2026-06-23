"use client";

// ============================================================================
// ZONO — Home (Real Estate Operating System). Structural redesign to the
// approved reference: 8 sections, RTL, ZONO purple system, luxury rhythm.
//   1 Hero (locked)         2 Daily Attention      3 Hot Properties
//   4 Opportunity Map       5 Activity + AI Radar   6 AI Command Center
//   7 AI Deal Forecast      8 ZONO Never Sleeps     + AI FAB
// All data comes from the server-built DashboardHomeData.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Reveal } from "@/components/dashboard/motion";
import { tr, type DashboardDict } from "@/lib/dashboard-home/i18n";
import type { DashboardHomeData } from "@/lib/dashboard-home/types";
import { DashboardHero, DashboardKpiStrip } from "./components/DashboardHero";
import { TodayAttentionSection } from "./components/TodayAttentionSection";
import { HotPropertiesSection } from "./components/HotPropertiesSection";
import {
  OpportunityMapSection,
  ActivityRadarSection,
  AICommandCenterSection,
  AIDealForecastSection,
  ZonoNeverSleepsSection,
  ExclusiveDealsSection,
  CompetitorThreatsSection,
  type ExclusiveDeal,
  type CompetitorThreat,
} from "./components/ReferenceSections";

const FAB_ACTIONS: { l: string; i: string; h: string }[] = [
  { l: "aiActions.findSellers", i: "Home", h: "/sellers" },
  { l: "aiActions.findBuyers", i: "Users", h: "/buyers" },
  { l: "aiActions.analyzeNeighborhood", i: "MapPin", h: "/market" },
  { l: "aiActions.analyzeProperty", i: "Building2", h: "/properties" },
  { l: "aiActions.createCampaign", i: "Megaphone", h: "/creative" },
  { l: "aiActions.createPost", i: "Sparkles", h: "/creative" },
  { l: "aiActions.openOpportunities", i: "Target", h: "/command" },
];

export function DashboardHomeView({
  dict,
  data,
  exclusiveDeals = [],
  threats = [],
}: {
  dict: DashboardDict;
  data: DashboardHomeData;
  exclusiveDeals?: ExclusiveDeal[];
  threats?: CompetitorThreat[];
}) {
  const t = useMemo(() => (k: string) => tr(dict, k), [dict]);
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div dir="rtl" className="relative flex flex-col gap-12 sm:gap-14">
      {/* 1 — Hero + KPI strip (locked) */}
      <Reveal>
        <div className="flex flex-col gap-5">
          <DashboardHero t={t} data={data} />
          <DashboardKpiStrip t={t} kpis={data.kpis} />
        </div>
      </Reveal>

      {/* 2 — Daily Attention Center · מה דורש טיפול היום? */}
      <TodayAttentionSection t={t} items={data.attention} />

      {/* 3 — Hot Properties carousel · נכסים חמים בשוק */}
      <HotPropertiesSection t={t} properties={data.hotProperties} />

      {/* 4 — Opportunity Map (full-width dark centerpiece) */}
      <OpportunityMapSection t={t} data={data} />

      {/* 5 — Activity Timeline + AI Opportunity Radar */}
      <ActivityRadarSection t={t} data={data} />

      {/* 6 — AI Command Center (mission control) */}
      <AICommandCenterSection t={t} data={data} />

      {/* 7 — AI Deal Forecast (funnel · opportunities · market pulse) */}
      <AIDealForecastSection t={t} data={data} />

      {/* 8 — ZONO Never Sleeps (cinematic live counters) */}
      <ZonoNeverSleepsSection t={t} data={data} />

      {/* 9 — עסקאות שאסור לפספס · private-seller external deals */}
      <ExclusiveDealsSection deals={exclusiveDeals} agentName={data.agentName} />

      {/* 10 — מי מאיים עליך כרגע? · competitor threats */}
      <CompetitorThreatsSection threats={threats} />

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
