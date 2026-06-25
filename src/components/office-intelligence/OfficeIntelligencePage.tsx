"use client";
// ============================================================================
// ZONO — Office Intelligence™ executive operating system (Phase 16, managers+).
// Client orchestrator: holds the live OfficeDashboard, refreshes every 30s and
// on-demand, and composes all deterministic sub-views. AI sections are clearly
// labeled augmentation — they explain the numbers, never replace them.
// ============================================================================
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw, Layers } from "lucide-react";
import { getOfficeDashboardAction, runOfficeSnapshotAction } from "@/lib/office-intelligence/actions";
import type { OfficeDashboard } from "@/lib/office-intelligence/types";
import { ExecutivePulse } from "./ExecutivePulse";
import { OfficeKpiStrip } from "./OfficeKpiStrip";
import { AgentPerformanceTable } from "./AgentPerformanceTable";
import { OfficeLeaderboard } from "./OfficeLeaderboard";
import { OfficeOpportunityBoard } from "./OfficeOpportunityBoard";
import { OfficeRiskCenter } from "./OfficeRiskCenter";
import { OfficeCoachingCenter } from "./OfficeCoachingCenter";
import { OfficeHeatmap } from "./OfficeHeatmap";
import { OfficeActivityStream } from "./OfficeActivityStream";
import { OfficeForecastPanel } from "./OfficeForecastPanel";
import { OfficeGoalsPanel } from "./OfficeGoalsPanel";
import { OfficeReportsPanel } from "./OfficeReportsPanel";
import { OfficeCopilotPanel } from "./OfficeCopilotPanel";

type TabKey = "overview" | "team" | "opportunities" | "growth" | "reports";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "סקירה" }, { key: "team", label: "צוות" },
  { key: "opportunities", label: "הזדמנויות" }, { key: "growth", label: "צמיחה" },
  { key: "reports", label: "דוחות" },
];

export function OfficeIntelligencePage({ initial }: { initial: OfficeDashboard }) {
  const [data, setData] = useState<OfficeDashboard>(initial);
  const [tab, setTab] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [snapping, start] = useTransition();
  const lastFetch = useRef(0);

  const refresh = useCallback(async () => {
    if (Date.now() - lastFetch.current < 4000) return;
    lastFetch.current = Date.now();
    setRefreshing(true);
    const res = await getOfficeDashboardAction();
    if (res.ok) setData(res.data);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const id = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const runSnapshot = () => start(async () => { await runOfficeSnapshotAction(); await refresh(); });
  const updatedAt = new Date(data.generatedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4">
      <ExecutivePulse managerName={data.managerName} pulse={data.pulse} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${tab === t.key ? "bg-brand-strong text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}>{t.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-ink/40">עודכן {updatedAt}</span>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2.5 py-1.5 text-[12px] font-bold text-ink/70 hover:bg-black/10">
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> רענן
          </button>
          <button onClick={runSnapshot} disabled={snapping} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[12px] font-bold text-brand-strong hover:bg-brand-soft/70 disabled:opacity-50">
            <Layers size={13} /> {snapping ? "שומר…" : "שמור צילום"}
          </button>
        </div>
      </div>

      <OfficeKpiStrip cards={data.kpiCards} />

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <OfficeRiskCenter risks={data.risks} />
            <OfficeForecastPanel forecast={data.forecast} benchmarks={data.benchmarks} />
          </div>
          <OfficeHeatmap points={data.mapPoints} marketShare={data.marketShare} />
          <OfficeActivityStream activity={data.activity} />
        </div>
      )}

      {tab === "team" && (
        <div className="flex flex-col gap-4">
          <OfficeLeaderboard leaderboard={data.leaderboard} />
          <AgentPerformanceTable agents={data.leaderboard.ranked} />
          <OfficeCoachingCenter coaching={data.coaching} />
        </div>
      )}

      {tab === "opportunities" && (
        <div className="flex flex-col gap-4">
          <OfficeOpportunityBoard opportunities={data.opportunities} />
          <OfficeRiskCenter risks={data.risks} />
        </div>
      )}

      {tab === "growth" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <OfficeGoalsPanel goals={data.goals} onChanged={() => void refresh()} />
            <OfficeForecastPanel forecast={data.forecast} benchmarks={data.benchmarks} />
          </div>
          <OfficeCopilotPanel />
        </div>
      )}

      {tab === "reports" && (
        <div className="flex flex-col gap-4">
          <OfficeReportsPanel />
          <OfficeCopilotPanel />
        </div>
      )}
    </div>
  );
}
