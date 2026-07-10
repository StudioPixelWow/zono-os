"use client";
// ============================================================================
// 🏢 Brokerage Intelligence Workspace™ (Phase 26.4.3) — office-first operational
// intelligence center (RTL, premium). PRESENTATION + WORKFLOW ONLY: composes
// existing read models (command center · offices index · research snapshot ·
// city discovery audit) and the existing resumable research engine. No engine /
// schema / API / calculation changes. Tabs keep the office directory primary and
// push raw broker lists behind a tab. Honest "trust" wording throughout.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BrokerageCommandCenter } from "@/lib/brokerage-data/service";
import type { OfficesIndex, OfficeIndexItem } from "@/lib/brokerage-data/office-profile";
import type { ResearchSnapshot } from "@/lib/brokerage-data/broker-research/engine";
import type { CityDiscoveryAudit } from "@/lib/brokerage-data/brokerage-discovery-audit";
import type { BrokeragePipelineAudit } from "@/lib/brokerage-data/brokerage-pipeline-audit";
import type { CityDiscoveryResult } from "@/lib/brokerage-data/city-discovery";
import type { AICandidateSeedSummary } from "@/lib/brokerage-data/ai-candidate-seeding";
import type { ResearchDepth } from "@/lib/brokerage-data/research-agent/types";
import type { ResearchJob } from "@/lib/brokerage-data/research-jobs/types";
import { JOB_STAGE_HE, JOB_STATUS_HE } from "@/lib/brokerage-data/research-jobs/types";
import type { ContinuousTickResult, SchedulerPlan } from "@/lib/brokerage-data/continuous-learning/types";
import type { PromotionDebugDashboard, PromotionStatus } from "@/lib/brokerage-data/promotion-debug/types";
import { PIPELINE_STAGES, PIPELINE_STAGE_HE } from "@/lib/brokerage-data/promotion-debug/types";
import type { CityBrokerageCensus, CityKnowledgeStatus } from "@/lib/brokerage-data/brokerage-knowledge";
import type { EnsureCityResult } from "@/lib/brokerage-data/city-lazy-learning";
import {
  getBrokerageOfficesIndexAction, getResearchSnapshotAction,
  getCityDiscoveryAuditAction, auditBrokerageDiscoveryPipelineAction,
  discoverBrokerageOfficesForCityAction, getCityBrokerageCensusAction,
  getCityKnowledgeStatusAction, ensureCityBrokerageKnowledgeAction, runBrokerResearchAction,
  seedCityAICandidatesAction, crossCheckCityRepositoriesAction,
  startCityResearchJobAction, resumeCityResearchJobAction, cancelCityResearchJobAction,
  getContinuousSchedulerPlanAction, runContinuousLearningTickAction, getPromotionDebugAction,
  buildOfficeIntelligenceForCandidateAction, buildOfficeIntelligenceForCityAction, getBrandHierarchyAction,
  getCityTerritoryIntelligenceAction, getCityCompetitiveDashboardAction, getCityDecisionBriefingAction,
  getActionCenterAction, getChiefOfStaffAction, getTruthReportAction, getOrgMemoryAction, getRelationshipGraphAction, getBuyerTwinsAction, getSellerTwinsAction, getLeadTwinsAction, getCrmGraphAction, getCustomerJourneysAction, getAgentsDashboardAction, setAgentEnabledAction, approveInboxItemAction, rejectInboxItemAction, getListingScorecardsAction, getBuyerAgentScorecardsAction, getSellerAgentScorecardsAction, getLeadAgentScorecardsAction, getOfficeGrowthScorecardAction, getOrchestratorDashboardAction, askZonoAction, getAskHistoryAction,
  type CrmDashboardResult,
} from "@/lib/brokerage-data/actions";
import type { ChiefOfStaffReport } from "@/lib/chief-of-staff";
import type { OrgTruthReport } from "@/lib/truth-engine";
import { FRESHNESS_HE, VERIFICATION_HE } from "@/lib/truth-engine/types";
import type { OrgMemoryReport } from "@/lib/org-memory";
import type { RelationshipReport } from "@/lib/relationship-graph";
import { RELATION_HE } from "@/lib/relationship-graph/types";
import type { BuyerTwinsOverview } from "@/lib/digital-twin/buyers";
import type { SellerTwinsOverview } from "@/lib/digital-twin/sellers";
import type { LeadTwinsOverview } from "@/lib/digital-twin/leads";
import type { CustomerJourneysOverview } from "@/lib/digital-twin/customer";
import { STAGE_HE, ROLE_HE } from "@/lib/digital-twin/customer/types";
import type { AgentsDashboard } from "@/lib/agent-framework";
// NOTE: value (constant) imports below come from each engine's pure `/types`
// submodule — NOT the package barrel — because the barrels re-export server-only
// services. A client component importing a value from the barrel would pull
// `server-only`/`node:async_hooks` into the browser bundle and break the build.
// Type-only imports may stay on the barrel (they are erased at compile time).
import type { ListingScorecardsOverview } from "@/lib/listing-agent";
import { STRATEGY_HE } from "@/lib/listing-agent/types";
import type { BuyerAgentScorecardsOverview } from "@/lib/buyer-agent";
import { BUYER_STRATEGY_HE } from "@/lib/buyer-agent/types";
import type { SellerAgentScorecardsOverview } from "@/lib/seller-agent";
import { SELLER_STRATEGY_HE } from "@/lib/seller-agent/types";
import type { LeadAgentScorecardsOverview } from "@/lib/lead-agent";
import { LEAD_STRATEGY_HE, ROUTING_HE } from "@/lib/lead-agent/types";
import type { OfficeGrowthOverview } from "@/lib/office-agent";
import { OFFICE_STRATEGY_HE, OFFICE_DECISION_HE } from "@/lib/office-agent/types";
import type { OrchestratorOverview } from "@/lib/agent-orchestrator";
import { AGENT_HE, EVENT_HE, STANCE_HE } from "@/lib/agent-orchestrator/types";
import StartWorkflowButton from "@/components/workflow-builder/StartWorkflowButton";
import type { EntityKind as WfEntityKind } from "@/lib/workflow-builder/types";
const WF_KINDS = new Set(["buyer", "seller", "lead", "office", "property", "broker", "customer"]);
const asWfKind = (k: string): WfEntityKind | null => (WF_KINDS.has(k) ? (k as WfEntityKind) : null);
import type { AskZonoResponse, ChatTurn } from "@/lib/ask-zono";
import { ENGINE_HE } from "@/lib/ask-zono/types";
import type { CityEnrichmentResult } from "@/lib/brokerage-data/office-intelligence/types";
import type { BrandHierarchy } from "@/lib/brokerage-data/brand-identity/types";
import type { CityTerritoryIntelligence } from "@/lib/brokerage-data/territory-intelligence/types";
import { DOMINANCE_BAND_HE } from "@/lib/brokerage-data/territory-intelligence/types";
import type { CityCompetitiveDashboard } from "@/lib/brokerage-data/competitive-intelligence/types";
import type { DailyBriefing } from "@/lib/decision-engine/types";
import { EXECUTION_HE } from "@/lib/decision-engine/types";
import type { ActionCenter } from "@/lib/mission-engine/types";
import { EXEC_STATUS_HE } from "@/lib/mission-engine/types";
import type { CityRepositoryAudit } from "@/lib/brokerage-data/city-repository-audit";

const fmt = (n: number) => n.toLocaleString("he-IL");
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const timeAgo = (iso: string | null) => {
  if (!iso) return "טרם";
  const d = (Date.now() - new Date(iso).getTime()) / 60000;
  if (d < 60) return `לפני ${Math.max(1, Math.round(d))} דק'`;
  if (d < 1440) return `לפני ${Math.round(d / 60)} שע'`;
  return `לפני ${Math.round(d / 1440)} ימים`;
};

type Tab = "offices" | "research" | "agents" | "sources";
type OfficeSort = "active" | "largest" | "confidence";

const AUDIT_HE: Record<CityDiscoveryAudit["classification"], string> = {
  DISCOVERY_OK: "גילוי תקין",
  OFFICE_CREATION_TOO_STRICT: "סף יצירת משרד מחמיר מדי",
  OFFICE_NAME_EXTRACTION_MISSING: "חסר חילוץ שמות משרד מהמקור",
  SOURCE_COVERAGE_TOO_WEAK: "כיסוי מקורות חלש מדי",
  GROUPING_TOO_AGGRESSIVE: "קיבוץ אגרסיבי מדי",
  UNKNOWN: "לא ודאי",
};

export function WorkspaceView({ cc }: { cc: BrokerageCommandCenter }) {
  const ov = cc.overview;
  const topAgents = ov.topAgentsByListings;
  const [index, setIndex] = useState<OfficesIndex | null>(null);
  const [research, setResearch] = useState<ResearchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("offices");

  const [q, setQ] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [sort, setSort] = useState<OfficeSort>("active");

  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState<{ done: number; total: number; linked: number } | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const stop = useRef(false);

  const reload = async () => {
    const [idx, res] = await Promise.all([getBrokerageOfficesIndexAction(), getResearchSnapshotAction()]);
    setIndex(idx); setResearch(res);
  };
  useEffect(() => {
    let alive = true;
    (async () => { setLoading(true); await reload().catch(() => {}); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, []);

  const runAutonomous = async () => {
    if (scanning) { stop.current = true; return; }
    setScanning(true); stop.current = false; setScanMsg(null);
    let linked = 0;
    try {
      for (let i = 0; i < 2000; i++) {
        if (stop.current) { setScanMsg("המחקר הושהה. ימשיך מהנקודה שנעצרה."); break; }
        const r = await runBrokerResearchAction();
        if (!r.ok) { setScanMsg(r.error ?? "המחקר נעצר."); break; }
        linked += r.diagnostics?.autoLinked ?? 0;
        const p = r.progress;
        if (p) setScanInfo({ done: p.researchedTotal, total: p.total, linked });
        if (!p || p.done || p.processedThisRun === 0) { setScanMsg(p?.done ? `המחקר הושלם — ${linked} מתווכים שויכו אוטומטית.` : "המחקר הסתיים."); break; }
      }
      await reload().catch(() => {});
    } catch (e) {
      setScanMsg(e instanceof Error ? `המחקר נעצר: ${e.message} — ימשיך בהרצה הבאה.` : "המחקר נעצר זמנית.");
    } finally { setScanning(false); }
  };

  const offices = useMemo(() => {
    const list = index?.offices ?? [];
    const needle = q.trim();
    const filtered = list.filter((o) =>
      (!cityFilter || o.city === cityFilter) &&
      (!needle || o.name.includes(needle) || (o.brandNetwork ?? "").includes(needle) || (o.city ?? "").includes(needle) || (o.phone ?? "").includes(needle)));
    return [...filtered].sort((a, b) =>
      sort === "largest" ? b.agentCount - a.agentCount :
      sort === "confidence" ? b.confidenceScore - a.confidenceScore :
      b.listingCount - a.listingCount);
  }, [index, q, cityFilter, sort]);

  const verifiedOffices = cc.stats.verifiedOffices;
  const totalOffices = index?.totals.offices ?? ov.officesTotal;
  const detectedBrokers = ov.agentsTotal;
  const verifiedBrokers = ov.agentsWithOffice;
  const researching = ov.agentsWithoutOffice;
  const conflicts = cc.stats.openConflicts;
  const listings = index?.totals.listings ?? ov.listingLinksTotal;
  const citiesCovered = index?.cities.length ?? 0;
  const lastRun = cc.runs[0] ?? null;
  const coverage = ov.dataQuality.score;
  const autoMatchRate = pct(verifiedBrokers, detectedBrokers);
  const candidatesInResearch = research?.counts.candidates ?? 0;
  const researchCompletion = research ? pct(research.counts.researched, research.counts.researched + research.unresearched) : autoMatchRate;

  const brokersByOffice = useMemo(() => {
    const groups = new Map<string, typeof topAgents>();
    for (const a of topAgents) {
      if (cityFilter && a.city !== cityFilter) continue;
      const key = a.officeName ?? "טרם שויך למשרד";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
    }
    return [...groups.entries()];
  }, [topAgents, cityFilter]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "offices", label: `משרדים (${fmt(totalOffices)})` },
    { id: "research", label: `במחקר (${fmt(researching)})` },
    { id: "agents", label: `סוכנים (${fmt(detectedBrokers)})` },
    { id: "sources", label: "מקורות וכיסוי" },
  ];

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* ── Hero + above-the-fold answers ── */}
      <section className="border-line bg-card relative overflow-hidden rounded-3xl border p-6 sm:p-8">
        <div className="bg-brand-soft/40 pointer-events-none absolute -top-28 -start-24 h-64 w-64 rounded-full blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-brand text-[11px] font-black tracking-[0.2em]">NATIONAL BROKERAGE KNOWLEDGE GRAPH</p>
            <h1 className="text-ink mt-1 text-3xl font-black sm:text-4xl">🏢 Brokerage Intelligence Workspace™</h1>
            <p className="text-muted mt-2 max-w-2xl text-sm leading-relaxed">
              ZONO בונה ומתחזק את גרף המודיעין של שוק התיווך. המערכת חוקרת אוטונומית; אתם מנהלים מודיעין, לא מזינים נתונים. המספרים משקפים כיסוי נוכחי — לא מאגר מלא.
            </p>
          </div>
          <div className="border-brand/30 bg-brand-soft/30 shrink-0 rounded-2xl border px-4 py-3 text-center">
            <div className="text-brand-strong text-3xl font-black tabular-nums">{coverage}%</div>
            <div className="text-muted text-[11px] font-bold">כיסוי גילוי</div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-2 text-sm">
          <GraphNode value={fmt(totalOffices)} label="משרדים" tone />
          <Arrow /><GraphNode value={fmt(verifiedBrokers)} label="מתווכים מאומתים" />
          <Arrow /><GraphNode value={fmt(listings)} label="נכסים" />
          <Arrow /><GraphNode value={fmt(citiesCovered)} label="ערים" />
          <Arrow /><GraphNode value={`${coverage}%`} label="כיסוי" tone />
        </div>
      </section>

      {/* Above-the-fold KPI answers (honest trust wording) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="משרדים מאומתים" value={fmt(verifiedOffices)} hint={`${fmt(totalOffices)} פעילים`} accent />
        <Kpi label="מועמדי משרד (במחקר)" value={fmt(candidatesInResearch)} hint="טרם אומתו" />
        <Kpi label="מתווכים במחקר" value={fmt(researching)} hint={`מתוך ${fmt(detectedBrokers)}`} />
        <Kpi label="שיוך אוטומטי" value={`${autoMatchRate}%`} hint="מתווכים↔משרד" accent />
        <Kpi label="ערים בכיסוי" value={fmt(citiesCovered)} hint={`${fmt(listings)} נכסים`} />
        <Kpi label="סריקה אחרונה" value={timeAgo(ov.latestRefreshRun?.finishedAt ?? null)} hint={`+${fmt(lastRun?.newOffices ?? 0)} משרדים`} />
      </div>

      {/* ── Tabs ── */}
      <div className="border-line bg-card flex flex-wrap gap-1 rounded-2xl border p-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition ${tab === t.id ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
        <span className="text-muted ms-auto self-center px-2 text-[11px]">כלים מתקדמים ונתוני גלם — בתחתית העמוד</span>
      </div>

      {/* City filter (shared) */}
      {(tab === "offices" || tab === "agents") && index && index.cities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
            className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
            <option value="">כל הערים</option>
            {index.cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {cityFilter && <span className="text-muted text-[11px]">מסונן לעיר: <b>{cityFilter}</b></span>}
        </div>
      )}

      {/* ── Offices tab (PRIMARY) ── */}
      {tab === "offices" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-ink text-lg font-black">מדריך המשרדים</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: משרד / מותג / עיר / טלפון"
                className="border-line bg-surface text-ink min-w-[220px] rounded-full border px-3 py-1.5 text-sm" />
              <select value={sort} onChange={(e) => setSort(e.target.value as OfficeSort)}
                className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
                <option value="active">הכי פעילים</option>
                <option value="largest">הגדולים ביותר</option>
                <option value="confidence">ביטחון גבוה</option>
              </select>
              <Link href="/brokerage-data/offices" className="text-brand-strong text-xs font-bold hover:underline">תצוגה מלאה →</Link>
            </div>
          </div>

          {candidatesInResearch > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] font-bold text-amber-800">
              בנוסף ל-{fmt(totalOffices)} המשרדים המאומתים, יש {fmt(candidatesInResearch)} מועמדי משרד שעדיין במחקר — הם יופיעו כאן לאחר אימות ראיות.
            </p>
          )}

          {loading ? (
            <div className="border-line bg-surface text-muted rounded-2xl border p-8 text-center text-sm">טוען מדריך משרדים…</div>
          ) : offices.length === 0 ? (
            <div className="border-line bg-surface text-muted rounded-2xl border border-dashed p-8 text-center text-sm">
              {cityFilter ? `אין משרדים מאומתים ב${cityFilter}. בדוק את לשונית "מקורות וכיסוי" כדי להבין מה חסר.` : "עדיין אין משרדים מאומתים. הפעל מחקר אוטונומי בלשונית 'במחקר'."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {offices.slice(0, 60).map((o) => <OfficeCard key={o.id} o={o} />)}
            </div>
          )}
        </section>
      )}

      {/* ── Research tab ── */}
      {tab === "research" && (
        <section className="border-line bg-card rounded-3xl border p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-ink text-lg font-black">🧠 Autonomous Research™</h2>
              <p className="text-muted mt-1 max-w-2xl text-[12px] leading-relaxed">
                המערכת חוקרת מתווכים שטרם שויכו ממקורות ציבוריים ומשייכת אוטומטית כשהביטחון חוצה את הסף. התערבות ידנית נדרשת רק בקונפליקטים נדירים.
              </p>
            </div>
            {research?.searchConfigured && (
              <button onClick={runAutonomous} className="bg-brand-strong hover:bg-brand-strong/90 shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition">
                {scanning ? "⏸ השהה מחקר" : "🧠 הפעל מחקר אוטונומי"}
              </button>
            )}
          </div>
          {!research?.searchConfigured && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12px] font-bold text-amber-800">
              מחקר ציבורי אינו מוגדר — הגדר ספק חיפוש (Tavily/SerpAPI/…) + <code>ZONO_PUBLIC_SEARCH_ENABLED</code> כדי שהמערכת תחקור אוטומטית.
            </p>
          )}
          {scanning && scanInfo && scanInfo.total > 0 && (
            <div className="mt-4">
              <div className="bg-surface h-2 w-full overflow-hidden rounded-full">
                <div className="bg-brand-strong h-full rounded-full transition-all" style={{ width: `${pct(scanInfo.done, scanInfo.total)}%` }} />
              </div>
              <p className="text-muted mt-1.5 text-[11px] font-bold">חוקר… {fmt(scanInfo.done)}/{fmt(scanInfo.total)} · {fmt(scanInfo.linked)} שויכו אוטומטית</p>
            </div>
          )}
          {scanMsg && <p className="text-brand-strong mt-2 text-[12px] font-bold">{scanMsg}</p>}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StateCard tone="green" emoji="🟢" title="מאומתים" value={fmt(verifiedBrokers)} desc="משרד זוהה בוודאות — שויך אוטומטית." />
            <StateCard tone="amber" emoji="🟡" title="במחקר" value={fmt(researching)} desc="אין עדיין ראיה מספקת — המערכת ממשיכה לחקור אוטומטית." />
            <StateCard tone="red" emoji="🔴" title="קונפליקט" value={fmt(conflicts)} desc="מקורות ציבוריים אמינים סותרים — נדרשת הכרעה ידנית." />
          </div>

          <h3 className="text-ink mt-6 mb-2 text-sm font-black">📡 סיכום מחקר אחרון</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="משרדים חדשים" value={fmt(lastRun?.newOffices ?? 0)} />
            <Mini label="מתווכים חדשים" value={fmt(lastRun?.newAgents ?? 0)} />
            <Mini label="פרופילים הועשרו" value={fmt(lastRun?.updatedRecords ?? 0)} />
            <Mini label="מועמדי משרד" value={fmt(candidatesInResearch)} tone="amber" />
            <Mini label="קונפליקטים" value={fmt(conflicts)} tone={conflicts > 0 ? "red" : undefined} />
            <Mini label="השלמת מחקר" value={`${researchCompletion}%`} tone="green" />
          </div>
        </section>
      )}

      {/* ── Agents tab (secondary, grouped by office) ── */}
      {tab === "agents" && (
        <section className="border-line bg-card rounded-3xl border p-5">
          <h2 className="text-ink text-lg font-black">מתווכים <span className="text-muted text-sm font-normal">(מקובץ לפי משרד)</span></h2>
          <div className="mt-4 flex flex-col gap-4">
            {brokersByOffice.length === 0 ? <p className="text-muted text-sm">אין מתווכים להצגה בסינון הנוכחי.</p> :
              brokersByOffice.map(([office, brokers]) => (
                <div key={office}>
                  <h3 className="text-brand-strong mb-1.5 text-sm font-black">🏢 {office} <span className="text-muted font-normal">({brokers.length})</span></h3>
                  <div className="flex flex-col gap-1.5">
                    {brokers.slice(0, 12).map((b) => (
                      <Link key={b.id} href={`/brokerage-data?broker=${b.id}&name=${encodeURIComponent(b.fullName)}`}
                        className="border-line bg-surface hover:border-brand/40 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors">
                        <span className="text-ink truncate font-bold">{b.fullName}<span className="text-muted font-normal"> · {b.city ?? "—"}</span></span>
                        <span className="flex shrink-0 items-center gap-2 text-[11px]">
                          <span className="text-muted">{fmt(b.listingCount)} מודעות</span>
                          <span className="bg-surface rounded-full px-2 py-0.5 font-bold tabular-nums">{Math.round(b.confidenceScore)}%</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── Sources & coverage tab — forensic pipeline audit + city discovery ── */}
      {tab === "sources" && (
        <div className="flex flex-col gap-4">
          <AskZonoPanel />
          <ChiefOfStaffPanel />
          <AgentsPanel />
          <OrchestratorPanel />
          <OfficeGrowthPanel />
          <ListingAgentPanel />
          <LeadAgentPanel />
          <BuyerAgentPanel />
          <SellerAgentPanel />
          <CustomerJourneyPanel />
          <CrmRelationshipPanel />
          <DigitalTwinPanel />
          <SellerTwinPanel />
          <LeadTwinPanel />
          <TruthEnginePanel />
          <OrgMemoryPanel />
          <RelationshipGraphPanel />
          <ActionCenterPanel />
          <CommandCenterPanel cities={index?.cities ?? []} />
          <ContinuousLearningPanel onChanged={reload} />
          <CityKnowledgeStatusPanel cities={index?.cities ?? []} onChanged={reload} />
          <CityCensusPanel cities={index?.cities ?? []} />
          <CityDiscoveryPanel cities={index?.cities ?? []} onChanged={reload} />
          <TerritoryIntelligencePanel cities={index?.cities ?? []} />
          <CompetitiveDashboardPanel cities={index?.cities ?? []} />
          <BrandHierarchyPanel cities={index?.cities ?? []} />
          <PromotionDebugPanel cities={index?.cities ?? []} />
          <PipelineAuditPanel />
          <CityAuditPanel cities={index?.cities ?? []} />
        </div>
      )}
    </div>
  );
}

// ── Continuous Brokerage Intelligence — scheduler + differential refresh ─────
function ContinuousLearningPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [plan, setPlan] = useState<SchedulerPlan | null>(null);
  const [tick, setTick] = useState<ContinuousTickResult | null>(null);
  const [pending, setPending] = useState<null | "plan" | "tick">(null);
  const [err, setErr] = useState<string | null>(null);

  const loadPlan = async () => { setPending("plan"); setErr(null); try { const r = await getContinuousSchedulerPlanAction(); if (r.ok) setPlan(r.result ?? null); else setErr(r.error ?? "נכשל"); } finally { setPending(null); } };
  const runTick = async () => { setPending("tick"); setErr(null); try { const r = await runContinuousLearningTickAction(); if (r.ok) { setTick(r.result ?? null); setPlan(r.result?.plan ?? null); await onChanged().catch(() => {}); } else setErr(r.error ?? "נכשל"); } finally { setPending(null); } };

  return (
    <section className="rounded-3xl border border-indigo-200 bg-indigo-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-indigo-900 text-lg font-black">🔄 למידה רציפה של שוק התיווך</h2>
          <p className="text-muted mt-1 text-[12px]">כל עיר לומדת את עצמה כשמופיעים נתונים חדשים — רענון דיפרנציאלי בלבד (ללא AI/חיפוש מיותר), לפי סדר עדיפויות. אין צורך בלחיצת משתמש.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadPlan} disabled={pending != null} className="border-line bg-card text-ink rounded-xl border px-4 py-1.5 text-sm font-bold disabled:opacity-60">{pending === "plan" ? "טוען…" : "תור עדיפויות"}</button>
          <button onClick={runTick} disabled={pending != null} className="bg-indigo-600 rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending === "tick" ? "מריץ…" : "הרץ מחזור למידה"}</button>
        </div>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}

      {plan && (
        <div className="mt-4 text-[12px]">
          <div className="text-muted">נסרקו {fmt(plan.scannedCities)} ערים · בתור: {fmt(plan.queue.length)}{plan.picked ? ` · הבא: ${plan.picked.city} (${plan.picked.tierLabel})` : " · אין עבודה ממתינה"}</div>
          {plan.queue.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {plan.queue.slice(0, 8).map((p, i) => (
                <div key={i} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5">
                  <span className="text-ink font-bold">{i + 1}. {p.city}</span>
                  <span className="flex items-center gap-2 text-[11px]">
                    <span className={cn("rounded-full px-2 py-0.5 font-bold", p.tier === 1 ? "bg-rose-50 text-rose-700" : p.tier <= 3 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>עדיפות {p.tier} · {p.tierLabel}</span>
                    <span className="text-muted">ממתינים {fmt(p.signals.waitingCandidates)} · כיסוי {p.signals.coveragePct}% · רעננות {p.signals.freshnessScore}%</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tick && tick.ran && tick.picked && (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-surface px-3 py-2 text-[12px]">
          <b>מחזור הורץ על {tick.picked.city}</b> ({tick.picked.tierLabel}) · {tick.note}
          <div className="text-muted mt-1 text-[11px]">משרה: {tick.jobStatus ?? "—"} · ביטחון משרדים עודכן: {fmt(tick.confidenceEvolved)}</div>
          {tick.profileBefore && tick.profileAfter && (
            <div className="text-muted mt-1 text-[11px]">בריאות למידה: {tick.profileBefore.learningHealth}% → <b>{tick.profileAfter.learningHealth}%</b> · אומתו: {fmt(tick.profileBefore.verifiedOffices)} → <b>{fmt(tick.profileAfter.verifiedOffices)}</b> · ממתינים: {fmt(tick.profileBefore.waitingCandidates)} → <b>{fmt(tick.profileAfter.waitingCandidates)}</b></div>
          )}
        </div>
      )}
      {tick && !tick.ran && <p className="text-muted mt-3 text-[12px]">{tick.note}</p>}
    </section>
  );
}

// ── Lazy City Learning — knowledge status + bootstrap/refresh/reuse ──────────
const CITY_ACTION_HE: Record<CityKnowledgeStatus["recommendedAction"], string> = {
  BOOTSTRAP_CITY: "ללמוד את העיר", REFRESH_CITY: "לרענן ידע",
  REUSE_KNOWLEDGE: "להשתמש בידע קיים", INSUFFICIENT_DATA: "אין מספיק נתונים",
};
function CityKnowledgeStatusPanel({ cities, onChanged }: { cities: string[]; onChanged: () => Promise<void> }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [status, setStatus] = useState<CityKnowledgeStatus | null>(null);
  const [ensure, setEnsure] = useState<EnsureCityResult | null>(null);
  const [pending, setPending] = useState<null | "status" | "learn" | "audit">(null);
  const [repoAudit, setRepoAudit] = useState<CityRepositoryAudit | null>(null);

  const loadStatus = async () => { setPending("status"); setEnsure(null); try { setStatus(await getCityKnowledgeStatusAction(city)); } finally { setPending(null); } };
  const runRepoAudit = async () => { setPending("audit"); try { const r = await crossCheckCityRepositoriesAction(city); setRepoAudit(r.ok ? r.result ?? null : null); } finally { setPending(null); } };
  const run = async (force?: "bootstrap" | "refresh" | "reuse") => {
    setPending("learn");
    try {
      const r = await ensureCityBrokerageKnowledgeAction(city, "פעולה ידנית מהפאנל", force);
      if (r.ok) { setEnsure(r.result ?? null); await onChanged().catch(() => {}); setStatus(await getCityKnowledgeStatusAction(city)); }
    } finally { setPending(null); }
  };

  return (
    <section className="border-brand/40 bg-brand-soft/30 rounded-3xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-brand-strong text-lg font-black">🪄 למידת עיר לפי דרישה</h2>
          <p className="text-muted mt-1 text-[12px]">ZONO לומדת עיר רק כשהיא רלוונטית (משתמש/מתווך/מודעה חדשים, או ידע חסר/חלש/ישן). אין סריקה ארצית מראש.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} list="status-city-list" placeholder="עיר"
            className="border-line bg-surface text-ink min-w-[180px] rounded-full border px-3 py-1.5 text-sm" />
          <datalist id="status-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={loadStatus} disabled={pending != null || !city.trim()} className="border-line bg-card text-ink rounded-xl border px-4 py-1.5 text-sm font-bold disabled:opacity-60">{pending === "status" ? "בודק…" : "בדוק סטטוס"}</button>
          <button onClick={runRepoAudit} disabled={pending != null || !city.trim()} className="border-line bg-card text-muted rounded-xl border px-4 py-1.5 text-sm font-bold disabled:opacity-60">{pending === "audit" ? "בודק מאגרים…" : "🔍 בדוק מאגרים"}</button>
        </div>
      </div>

      {pending === "learn" && <p className="text-brand-strong mt-3 text-[12px] font-bold">ZONO לומדת את העיר ברקע — המידע ישתפר בהדרגה. אפשר להמשיך לעבוד.</p>}

      {status && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 font-bold", status.knowledgeState === "VERIFIED" ? "bg-emerald-50 text-emerald-700" : status.knowledgeState === "NO_CITY_DATA" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>{status.knowledgeStateLabel}</span>
            <span className="bg-surface text-muted rounded-full px-2.5 py-1 font-bold">פעולה מומלצת: {CITY_ACTION_HE[status.recommendedAction]}</span>
          </div>
          {status.stalenessReason && <div className="text-muted text-[11px]"><b>החלק החסר:</b> {status.stalenessReason}</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Mini label="נוכחות נתונים" value={`${status.dataPresenceScore}%`} tone={status.dataPresenceScore >= 60 ? "green" : status.rawDataExists ? "amber" : "red"} />
            <Mini label="מתווכים ידועים" value={fmt(status.knownBrokers)} tone={status.knownBrokers > 0 ? "green" : undefined} />
            <Mini label="מתווכים במחקר" value={fmt(status.brokersResearching)} tone="amber" />
            <Mini label="מודעות בעיר" value={fmt(status.knownListings)} tone={status.knownListings > 0 ? "green" : undefined} />
            <Mini label="נכסים פנימיים" value={fmt(status.propertiesInCity)} />
            <Mini label="מועמדים (AI)" value={fmt(status.aiCandidates)} />
            <Mini label="משרדים מאומתים" value={fmt(status.verifiedOffices)} tone={status.verifiedOffices > 0 ? "green" : "amber"} />
            <Mini label="מודעות מקושרות" value={fmt(status.linkedListings)} />
            <Mini label="רעננות" value={`${status.freshnessScore}%`} tone={status.freshnessScore >= 70 ? "green" : "amber"} />
            <Mini label="מחקר אחרון" value={status.lastResearchAt ? new Date(status.lastResearchAt).toLocaleDateString("he-IL") : "—"} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => run("bootstrap")} disabled={pending != null} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">למד עיר עכשיו</button>
            <button onClick={() => run("refresh")} disabled={pending != null} className="border-brand/40 bg-card text-brand-strong rounded-xl border px-4 py-1.5 text-sm font-bold disabled:opacity-60">רענן ידע</button>
            <button onClick={() => run("reuse")} disabled={pending != null} className="border-line bg-card text-muted rounded-xl border px-4 py-1.5 text-sm font-bold disabled:opacity-60">השתמש בידע קיים</button>
          </div>
        </div>
      )}

      {ensure && (
        <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-[12px]">
          <b>תוצאה: {ensure.decision === "bootstrapped" ? "נלמדה (Bootstrap)" : ensure.decision === "refreshed" ? "רועננה" : ensure.decision === "reused" ? "שימוש חוזר" : "אין מספיק נתונים"}</b>
          <ul className="text-muted mt-1 flex flex-col gap-0.5">
            <li>למה רץ: {ensure.explanation.whyRan}</li>
            <li>ידע קודם: {ensure.explanation.knownBefore}</li>
            <li>נלמד עכשיו: {ensure.explanation.newlyLearned}</li>
            <li>מחקר שנחסך: {ensure.explanation.researchAvoided}</li>
            <li>נותר לא ידוע: {ensure.explanation.remainingUnknown}</li>
            <li>רענון הבא: {ensure.explanation.nextRefresh}</li>
          </ul>
        </div>
      )}

      {repoAudit && (
        <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-[12px]">
          <div className="text-ink font-black">🔍 בדיקת מאגרים — {repoAudit.city}</div>
          <div className={cn("mt-1 rounded-lg px-2 py-1 text-[11px] font-bold", repoAudit.verdict === "REPOSITORY_OK" ? "bg-emerald-50 text-emerald-700" : repoAudit.verdict === "NO_DATA" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>שורש הבעיה: {repoAudit.rootCause}</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted"><tr><th className="text-right">טבלה</th><th>סה״כ</th><th>עיר מדויקת</th><th>עיר מנורמלת</th><th>ללא עיר</th><th>אנגלית</th><th>שדה</th></tr></thead>
              <tbody>
                {repoAudit.tables.map((t, i) => (
                  <tr key={i} className={cn("border-line border-b", !t.exists && "opacity-50")}>
                    <td className="py-1 font-bold">{t.table}</td>
                    <td className="text-center tabular-nums">{t.error ? <span className="text-rose-600" title={t.error}>—</span> : fmt(t.totalOrgRows)}</td>
                    <td className="text-center tabular-nums">{fmt(t.exactCityRows)}</td>
                    <td className="text-center tabular-nums font-bold text-emerald-700">{fmt(t.normalizedCityRows)}</td>
                    <td className="text-center tabular-nums">{fmt(t.missingCityRows)}</td>
                    <td className="text-center tabular-nums">{fmt(t.englishVariantRows)}</td>
                    <td className="text-center text-muted">{t.cityFieldUsed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted mt-1 text-[10px]">עמודת &quot;עיר מנורמלת&quot; = מה שהשכבה המתוקנת קוראת (התאמת אסימונים/הכלה/אנגלית).</p>
        </div>
      )}
    </section>
  );
}

// ── National Brokerage Census panel (read-only coverage metrics) ─────────────
function CityCensusPanel({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [data, setData] = useState<CityBrokerageCensus | null>(null);
  const [pending, setPending] = useState(false);
  const run = async () => { setPending(true); try { setData(await getCityBrokerageCensusAction(city)); } finally { setPending(false); } };

  return (
    <section className="border-line bg-card rounded-3xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">🗺️ מפקד משרדי תיווך לאומי — כיסוי עירוני</h2>
          <p className="text-muted mt-1 text-[12px]">כמה מהשוק כבר ממופה? מספרים מבוססי-ראיות בלבד (ללא המצאת גודל שוק).</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} list="census-city-list" placeholder="עיר"
            className="border-line bg-surface text-ink min-w-[180px] rounded-full border px-3 py-1.5 text-sm" />
          <datalist id="census-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={run} disabled={pending || !city.trim()} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "טוען…" : "הצג מפקד"}</button>
        </div>
      </div>

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="border-brand/30 bg-brand-soft/30 rounded-2xl border p-3 text-center">
            <div className="text-muted text-[11px] font-bold">{data.city} · {data.knowledgeStateLabel}</div>
            <div className="text-brand-strong text-3xl font-black tabular-nums">{data.dataPresenceScore}%</div>
            <div className="text-muted text-[11px]">נוכחות נתונים גולמיים · כיסוי מאומת: <b>{data.marketCoveragePct}%</b> · אומדן משרדים פעילים: <b>{fmt(data.estimatedActiveOffices)}</b> · מאומתים <b>{fmt(data.verifiedOffices)}</b></div>
          </div>
          {/* RAW market data — always shown so 0 verified never reads as 0 data */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="מתווכים בעיר" value={fmt(data.brokersTotal)} tone={data.brokersTotal > 0 ? "green" : undefined} />
            <Mini label="מתווכים במחקר" value={fmt(data.brokersResearching)} tone="amber" />
            <Mini label="מודעות בעיר" value={fmt(data.listingsTotal)} tone={data.listingsTotal > 0 ? "green" : undefined} />
            <Mini label="נכסים פנימיים" value={fmt(data.propertiesTotal)} />
            <Mini label="מועמדי משרד" value={fmt(data.missingKnowledge.unverifiedCandidates)} />
            <Mini label="מועמדים (AI)" value={fmt(data.aiCandidates)} />
          </div>
          {/* VERIFIED knowledge — separated from raw data */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="משרדים מאומתים" value={fmt(data.verifiedOffices)} tone={data.verifiedOffices > 0 ? "green" : "amber"} />
            <Mini label="כיסוי מתווכים" value={`${data.brokerCoveragePct}%`} />
            <Mini label="כיסוי מודעות" value={`${data.listingCoveragePct}%`} />
            <Mini label="מתווכים ללא משרד" value={fmt(data.brokersUnmatched)} tone="amber" />
            <Mini label="מודעות ללא משרד" value={fmt(data.listingsUnlinked)} tone="amber" />
            <Mini label="ביטחון ממוצע" value={`${data.avgOfficeConfidence}%`} />
          </div>
          <div className="text-muted">מחקר אחרון: {data.lastResearchAt ? new Date(data.lastResearchAt).toLocaleDateString("he-IL") : "—"}{data.cityVariants.length > 1 ? ` · איותים: ${data.cityVariants.join(" / ")}` : ""}</div>
          {data.offices.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <b>משרדים מאומתים (הסבר):</b>
              {data.offices.slice(0, 20).map((o) => (
                <Link key={o.id} href={`/brokerage-data/office/${o.id}`} className="border-line bg-surface hover:border-brand/40 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors">
                  <span className="text-ink truncate font-bold">{o.name}<span className="text-muted font-normal">{o.brand ? ` · ${o.brand}` : ""}{o.phones[0] ? ` · ${o.phones[0]}` : ""}{o.website ? ` · ${o.website}` : ""}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px]">
                    <span className="text-muted">{fmt(o.brokerCount)} מתווכים</span>
                    <span className="bg-surface rounded-full px-2 py-0.5 font-bold tabular-nums">{Math.round(o.confidence)}%</span>
                    <span className="text-muted">{o.lastVerifiedAt || o.lastSeenAt ? new Date((o.lastVerifiedAt || o.lastSeenAt)!).toLocaleDateString("he-IL") : "—"}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

// ── City-first office discovery panel (writes candidates/offices) ────────────
function CityDiscoveryPanel({ cities, onChanged }: { cities: string[]; onChanged: () => Promise<void> }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [depth, setDepth] = useState<"quick" | "deep">("quick");
  const [publicResearch, setPublicResearch] = useState(true);
  const [rematch, setRematch] = useState(true);
  const [data, setData] = useState<CityDiscoveryResult | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Phase 26.4.11 — AI candidate seeding (AI proposes, public sources verify).
  const [seed, setSeed] = useState<AICandidateSeedSummary | null>(null);
  const [seedPending, setSeedPending] = useState(false);
  const [seedErr, setSeedErr] = useState<string | null>(null);
  // Phase 26.4.15 — persistent background research job (resumable, no timeout).
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [agentDepth, setAgentDepth] = useState<ResearchDepth>("standard");
  const [jobPending, setJobPending] = useState(false);
  const [jobErr, setJobErr] = useState<string | null>(null);
  const [jobMigration, setJobMigration] = useState(false);
  const [autoContinue, setAutoContinue] = useState(true);

  const run = async () => {
    setPending(true); setErr(null);
    try {
      const r = await discoverBrokerageOfficesForCityAction(city, { depth, includePublicResearch: publicResearch, includeBrokerRematch: rematch });
      if (r.ok) { setData(r.result ?? null); await onChanged().catch(() => {}); } else setErr(r.error ?? "נכשל");
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setPending(false); }
  };

  const runSeed = async () => {
    setSeedPending(true); setSeedErr(null);
    try {
      const r = await seedCityAICandidatesAction(city);
      if (r.ok) { setSeed(r.result ?? null); await onChanged().catch(() => {}); } else setSeedErr(r.error ?? "נכשל");
    } catch (e) { setSeedErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setSeedPending(false); }
  };

  const startJob = async () => {
    setJobPending(true); setJobErr(null); setJobMigration(false);
    try {
      const r = await startCityResearchJobAction(city, agentDepth);
      if (r.migrationRequired) { setJobMigration(true); setJobErr(r.error ?? null); }
      else if (r.ok) { setJob(r.job ?? null); await onChanged().catch(() => {}); }
      else setJobErr(r.error ?? "נכשל");
    } catch (e) { setJobErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setJobPending(false); }
  };
  const resumeJob = async () => {
    if (!job) return;
    setJobPending(true); setJobErr(null);
    try {
      const r = await resumeCityResearchJobAction(job.id);
      if (r.ok) { setJob(r.job ?? null); await onChanged().catch(() => {}); } else setJobErr(r.error ?? "נכשל");
    } catch (e) { setJobErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setJobPending(false); }
  };
  const cancelJob = async () => {
    if (!job) return;
    const r = await cancelCityResearchJobAction(job.id);
    if (r.ok) setJob(r.job ?? null);
  };
  // Auto-continue: while a job is "waiting" and auto is on, resume from checkpoint.
  useEffect(() => {
    if (!job || !autoContinue || jobPending) return;
    if (job.status !== "waiting") return;
    const t = setTimeout(() => { void resumeJob(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, job?.updatedAt, autoContinue, jobPending]);

  return (
    <section className="border-brand/40 bg-brand-soft/30 rounded-3xl border p-5 sm:p-6">
      <h2 className="text-brand-strong text-lg font-black">🔍 גלה משרדי תיווך בעיר</h2>
      <p className="text-muted mt-1 text-[12px]">גישה עיר-תחילה: קודם מגלים את המשרדים בעיר (גם לפני שיוך מתווכים), אחר כך משייכים מתווכים. משרד נוצר ממקור חזק אחד — ללא דרישת 2 מתווכים. ללא טלפון/אתר/לוגו מומצאים.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} list="disc-city-list" placeholder="עיר (למשל קריית ביאליק)"
          className="border-line bg-surface text-ink min-w-[200px] rounded-full border px-3 py-1.5 text-sm" />
        <datalist id="disc-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        <select value={depth} onChange={(e) => setDepth(e.target.value as "quick" | "deep")} className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
          <option value="quick">מהיר</option><option value="deep">מעמיק</option>
        </select>
        <label className="text-muted flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={publicResearch} onChange={(e) => setPublicResearch(e.target.checked)} /> מחקר ציבורי</label>
        <label className="text-muted flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={rematch} onChange={(e) => setRematch(e.target.checked)} /> שיוך מתווכים</label>
        <button onClick={run} disabled={pending || !city.trim()} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מגלה…" : "גלה משרדים"}</button>
        <button onClick={runSeed} disabled={seedPending || !city.trim()} className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-1.5 text-sm font-bold text-violet-800 disabled:opacity-60">{seedPending ? "מציע…" : "✨ הצע מועמדים עם AI"}</button>
        <span className="mx-1 h-5 w-px bg-line" />
        <select value={agentDepth} onChange={(e) => setAgentDepth(e.target.value as ResearchDepth)} className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
          <option value="quick">מהיר</option><option value="standard">רגיל</option><option value="deep">מעמיק</option>
        </select>
        <button onClick={startJob} disabled={jobPending || !city.trim()} className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-1.5 text-sm font-bold text-indigo-800 disabled:opacity-60">{jobPending ? "מפעיל…" : "🧠 חקור את שוק התיווך בעיר"}</button>
        <label className="text-muted flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={autoContinue} onChange={(e) => setAutoContinue(e.target.checked)} /> המשך אוטומטי</label>
      </div>
      <p className="text-muted mt-1 text-[11px]">המחקר רץ כמשרת רקע מתמשכת עם צ׳קפוינטים — הממשק אינו ממתין לסיום ותקלת timeout אינה מאבדת התקדמות. ניתן להמשיך מהנקודה שנעצרה.</p>
      {jobMigration && <p className="mt-2 font-semibold text-rose-700">טבלת המשרות אינה קיימת — יש להריץ את מיגרציית 26.4.15 (brokerage_research_jobs) ב-Supabase.</p>}
      {jobErr && !jobMigration && <p className="mt-2 font-semibold text-rose-700">{jobErr}</p>}

      {job && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-indigo-900 font-black">🧠 משרת מחקר — {job.city} ({job.depth})</span>
            <span className="flex items-center gap-2 text-[11px]">
              <span className={cn("rounded-full px-2 py-0.5 font-bold", job.status === "completed" ? "bg-emerald-50 text-emerald-700" : job.status === "waiting" ? "bg-amber-50 text-amber-700" : job.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-indigo-100 text-indigo-700")}>{JOB_STATUS_HE[job.status]}</span>
              <span className="text-muted">שלב: {JOB_STAGE_HE[job.currentStage]}</span>
              <span className="text-muted tabular-nums">{job.progressPercent}%</span>
            </span>
          </div>
          <div className="bg-line/50 h-1.5 w-full overflow-hidden rounded-full"><div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${job.progressPercent}%` }} /></div>
          {job.status === "waiting" && <p className="text-amber-700 text-[11px] font-bold">המחקר נשמר. אפשר להמשיך מהנקודה שבה נעצר.{autoContinue ? " (ממשיך אוטומטית…)" : ""}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="חיפושים" value={fmt(job.searchesCompleted)} />
            <Mini label="נמצאו" value={fmt(job.candidatesFound)} />
            <Mini label="נשמרו (במחקר)" value={fmt(job.candidatesSaved)} tone="amber" />
            <Mini label="אומתו" value={fmt(job.candidatesVerified)} tone="green" />
            <Mini label="במחקר" value={fmt(job.candidatesResearching)} tone="amber" />
            <Mini label="ממתינים לראיה" value={fmt(job.candidatesWaitingForEvidence)} />
            <Mini label="נדחו" value={fmt(job.candidatesRejected)} tone="red" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(job.status === "waiting" || job.status === "queued") && <button onClick={resumeJob} disabled={jobPending} className="bg-indigo-600 rounded-lg px-3 py-1 text-xs font-bold text-white disabled:opacity-60">{jobPending ? "ממשיך…" : "המשך עכשיו"}</button>}
            {(job.status === "waiting" || job.status === "running" || job.status === "queued") && <button onClick={cancelJob} disabled={jobPending} className="border-line bg-card text-muted rounded-lg border px-3 py-1 text-xs font-bold disabled:opacity-60">בטל</button>}
            {job.resultSummary && <span className="text-muted text-[11px]">מאומתים: <b>{fmt(Number(job.resultSummary.verifiedOffices ?? 0))}</b> · מתווכים: <b>{fmt(Number(job.resultSummary.brokersTotal ?? 0))}</b> · מודעות: <b>{fmt(Number(job.resultSummary.listingsTotal ?? 0))}</b></span>}
          </div>
          {job.logs.length > 0 && (
            <div className="text-muted text-[11px]"><b>יומן שלבים:</b> {job.logs.slice(-6).map((l) => `${JOB_STAGE_HE[l.stage]} (${fmt(l.itemsProcessed)}, ${fmt(l.durationMs)}ms)`).join(" ← ")}</div>
          )}
          {job.errors.length > 0 && <div className="rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2 text-rose-700"><b>שגיאות:</b> {job.errors.slice(-4).map((e) => `${JOB_STAGE_HE[e.stage]}: ${e.message}`).join(" · ")}</div>}
        </div>
      )}
      <p className="text-muted mt-1 text-[11px]">זריעת AI: ה-AI מציע <b>שמות מועמדים בלבד</b>. כל מועמד נחקר במקורות ציבוריים — ומקבל סטטוס &quot;מאומת&quot; <b>רק</b> עם ראיה ציבורית אמיתית. ללא ראיה הוא נשאר &quot;במחקר&quot;. ה-AI לעולם אינו מאמת בעצמו.</p>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {seedErr && <p className="mt-2 font-semibold text-rose-700">{seedErr}</p>}

      {seed && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-3 text-[12px]">
          <div className="text-violet-900 font-black">✨ זריעת מועמדי AI — {seed.city}</div>
          {!seed.aiConfigured && <p className="font-semibold text-rose-700">מנוע ה-AI אינו מוגדר (חסר OPENAI_API_KEY).</p>}
          {seed.aiConfigured && !seed.searchConfigured && <p className="font-semibold text-amber-700">⚠ אין ספק חיפוש ציבורי — כל המועמדים יישארו &quot;במחקר&quot; עד שיתווסף מקור אימות.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="הוצעו ע״י AI" value={fmt(seed.candidatesGenerated)} />
            <Mini label="ייחודיים" value={fmt(seed.candidatesAfterDedup)} />
            <Mini label="נשמרו (במחקר)" value={fmt(seed.candidatesSaved)} tone="amber" />
            <Mini label="אומתו" value={fmt(seed.candidatesVerified)} tone="green" />
            <Mini label="במחקר" value={fmt(seed.candidatesResearching)} tone="amber" />
            <Mini label="ממתינים לראיה" value={fmt(seed.candidatesWaitingForEvidence)} />
            <Mini label="נדחו" value={fmt(seed.candidatesRejected)} tone="red" />
          </div>
          {/* Progress log (Part 4 — never looks stuck) */}
          {seed.steps.length > 0 && <div className="text-muted text-[11px]"><b>מהלך הריצה:</b> {seed.steps.join(" ← ")}</div>}
          {seed.timedOut && <p className="font-semibold text-amber-700">הפעולה התחילה אך עשויה להמשיך בהרצה הבאה / ידנית — חלק מהמועמדים ממתינים לאימות ציבורי.</p>}
          <div className="text-muted">ראיות ציבוריות שנמצאו: <b>{fmt(seed.evidenceFound)}</b></div>
          {seed.candidates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {seed.candidates.slice(0, 30).map((c, i) => (
                <div key={i} className="border-line bg-surface rounded-xl border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink font-bold">{c.officeName}</span>
                    <span className="flex items-center gap-2 text-[11px]">
                      {c.status === "verified"
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">מאומת · ראיה ציבורית</span>
                        : c.status === "rejected"
                          ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">נדחה</span>
                          : c.researched
                            ? <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-700">AI suggested · researching</span>
                            : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">AI suggested · ממתין לראיה</span>}
                      <span className="text-muted tabular-nums" title="ביטחון מערכת (מבוסס ראיות)">מערכת {c.systemConfidence}%</span>
                      <span className="text-violet-500 tabular-nums" title="ביטחון ה-AI — ללא סמכות">AI {c.aiConfidence}%</span>
                    </span>
                  </div>
                  {c.aiReason && <div className="text-muted mt-1 text-[11px]"><b>סיבת ה-AI:</b> {c.aiReason}</div>}
                  <div className="text-muted mt-0.5 text-[11px]"><b>מקורות שנבדקו:</b> {c.sourcesChecked.join(" · ") || "—"}</div>
                  {c.evidenceFound.length > 0 && <div className="mt-0.5 text-[11px] text-emerald-700"><b>ראיות שנמצאו:</b> {c.evidenceFound.join(" · ")}</div>}
                  {c.evidenceMissing.length > 0 && <div className="mt-0.5 text-[11px] text-amber-700"><b>ראיות חסרות:</b> {c.evidenceMissing.join(" · ")}</div>}
                  <div className="text-muted mt-0.5 text-[11px] italic">{c.verdictReason}</div>
                </div>
              ))}
            </div>
          )}
          {seed.notes.length > 0 && <ul className="text-muted list-disc pr-5">{seed.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="משרדים שהתגלו" value={fmt(data.officesDiscovered)} tone="green" />
            <Mini label="מועמדים נוצרו" value={fmt(data.officeCandidatesCreated)} />
            <Mini label="מאומתים" value={fmt(data.verifiedOffices)} tone="green" />
            <Mini label="במחקר" value={fmt(data.researchingOffices)} tone="amber" />
            <Mini label="מתווכים שויכו" value={fmt(data.brokersMatched)} />
            <Mini label="מתווכים במחקר" value={fmt(data.brokersResearching)} tone="amber" />
            <Mini label="מודעות קושרו" value={fmt(data.listingsLinked)} />
          </div>
          {/* Persistent knowledge-base accounting (Part 7) */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface px-3 py-2">
              <div className="text-ink font-bold">🧠 ידע קיים לפני ההרצה</div>
              <div className="text-muted mt-0.5 text-[11px]">{fmt(data.knownBefore.offices)} משרדים · {fmt(data.knownBefore.brokersLinked)}/{fmt(data.knownBefore.brokers)} מתווכים משויכים · {fmt(data.knownBefore.candidates)} מועמדים · {fmt(data.knownBefore.listingsLinked)} מודעות מקושרות</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2">
              <div className="text-emerald-800 font-bold">✨ נלמד בהרצה זו</div>
              <div className="text-emerald-700 mt-0.5 text-[11px]">{fmt(data.newlyLearned.offices)} משרדים חדשים · {fmt(data.newlyLearned.brokers)} מתווכים שויכו · {fmt(data.newlyLearned.listings)} מודעות קושרו · {fmt(data.newlyLearned.candidates)} מועמדים</div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2">
              <div className="text-violet-900 font-bold">♻ מחקר שנחסך</div>
              <div className="text-violet-800 mt-0.5 text-[11px]">{fmt(data.researchAvoided.officesReused)} משרדים מהידע · {fmt(data.researchAvoided.brokersFromKnowledge)} מתווכים שויכו מהידע · {fmt(data.researchAvoided.listingsFromKnowledge)} מודעות מהידע</div>
            </div>
          </div>
          {data.aiAnalysis && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-violet-900">
              <b>ניתוח AI (על הראיות בלבד — אינו קובע שיוך):</b>
              <p className="mt-1 leading-relaxed">{data.aiAnalysis}</p>
            </div>
          )}
          <div className="text-muted">
            עיר מנורמלת: <b>{data.cityNormalized}</b>{data.cityVariants.length > 1 ? ` · איותים: ${data.cityVariants.join(" / ")}` : ""} · מקורות: {data.sourcesUsed.join(", ") || "—"} · מחקר ציבורי: {data.publicResearch.enabled ? `${data.publicResearch.queriesRun} שאילתות / ${data.publicResearch.resultsFound} תוצאות` : (data.publicResearch.reason ?? "כבוי")}
          </div>
          {data.discoveredOffices.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <b>משרדים שהתגלו (עם ראיות):</b>
              {data.discoveredOffices.slice(0, 20).map((o, i) => (
                <div key={i} className="border-line bg-surface rounded-xl border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink font-bold">{o.name}</span>
                    <span className="flex items-center gap-2 text-[11px]">
                      <span className={cn("rounded-full px-2 py-0.5 font-bold", o.matchedFrom === "knowledge_base" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600")}>{o.matchedFrom === "knowledge_base" ? "מהידע הקיים" : "סריקה נוכחית"}</span>
                      <span className={cn("rounded-full px-2 py-0.5 font-bold", o.status === "verified" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{o.status === "verified" ? "מאומת" : "במחקר"}</span>
                      <span className="text-muted tabular-nums">{o.confidence}%</span>
                      <span className="text-muted">{fmt(o.brokerCount)} מתווכים</span>
                    </span>
                  </div>
                  <div className="text-muted mt-1 text-[11px]">{o.evidence.join(" · ")}</div>
                </div>
              ))}
            </div>
          )}
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

// ── Forensic pipeline audit panel (read-only) ────────────────────────────────
const VERDICT_HE: Record<BrokeragePipelineAudit["verdict"], string> = {
  OFFICE_EXTRACTION_FAILURE: "כשל חילוץ שמות משרד",
  OFFICE_CREATION_FAILURE: "כשל יצירת משרדים",
  OFFICE_VERIFICATION_TOO_STRICT: "סף אימות מחמיר מדי",
  CITY_NORMALIZATION_FAILURE: "כשל נרמול עיר",
  REPOSITORY_MISMATCH: "אי-התאמה בין מאגרים",
  UI_SHOWING_INCOMPLETE_DATA: "הממשק מציג נתונים חלקיים",
  MULTIPLE_PIPELINE_FAILURES: "כשלים מרובים בצינור",
};

// ── Action Center — Universal Mission Engine (27.5) ──────────────────────────
// ── Seller Intelligence Agent — per-seller scorecards (29.5) ─────────────────
function SellerAgentPanel() {
  const [data, setData] = useState<SellerAgentScorecardsOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getSellerAgentScorecardsAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-emerald-600/50 bg-emerald-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-emerald-800">🏷️ סוכן מודיעין מוכרים — כרטיס לכל מוכר</h2>
          <p className="text-muted mt-1 text-[12px]">סוכן AI לכל מוכר: בריאות, מוכנות לחתימה, נכס+הערכת שווי+שוק, קונים ממתינים, סיכונים ואסטרטגיית מכירה מוסברת. המלצה בלבד — הכול דרך תיבת הסוכנים, ללא ביצוע אוטומטי.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-emerald-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח מוכרים…" : "הפעל סוכן מוכרים"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="מוכרים" value={fmt(data.totals.sellers)} />
            <Mini label="חמים" value={fmt(data.totals.hot)} tone="green" />
            <Mini label="בסיכון" value={fmt(data.totals.atRisk)} tone="red" />
            <Mini label="מוכן לחתימה" value={fmt(data.totals.readyToSign)} tone="green" />
            <Mini label="פערי מחיר" value={fmt(data.totals.priceIssues)} tone="amber" />
            <Mini label="עם קונים" value={fmt(data.totals.withBuyers)} />
            <Mini label="יוקרה" value={fmt(data.totals.luxury)} />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.scorecards.slice(0, 6).map((c) => (
            <div key={c.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{c.name}{c.classification.length ? <span className="text-emerald-700 font-bold"> · {c.classification.join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", c.health.label === "בריא" ? "bg-green-100 text-green-800" : c.health.label === "בסיכון" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800")}>{c.health.label}</span>
                  <span className="text-muted">בריאות {c.health.sellerHealth} · חתימה {c.health.readinessToSign} · נטישה {c.health.churnRisk}</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                מוטיבציה {c.health.motivation} · אמון {c.health.trust} · גמישות מחיר {c.health.priceFlexibility}
                {c.property.hasProperty ? <span> · נכס: מחיר {c.property.valuationPosition === "above" ? "מעל" : c.property.valuationPosition === "below" ? "מתחת" : c.property.valuationPosition === "within" ? "בתוך" : "?"} לטווח · שוק {c.property.marketScore ?? "—"} · ביקוש {c.property.buyerDemandScore ?? "—"}</span> : <span> · אין נכס מקושר</span>}
                {c.truthScore != null ? <span> · אמת {c.truthScore}</span> : null}
              </div>
              <div className="text-emerald-800 mt-1 rounded-lg border border-emerald-600/30 bg-emerald-50/40 px-2 py-1 text-[11px] font-bold">
                🎯 {SELLER_STRATEGY_HE[c.strategy.recommendedStrategy] ?? c.strategy.recommendedStrategy} · ביטחון {c.strategy.confidence}% · {c.strategy.change.signal === "switch" ? "החלף אסטרטגיה" : c.strategy.change.signal === "succeeded" ? "בהצלחה" : "פעיל"}
                <span className="text-muted font-normal"> — {c.aiRecommendation}</span>
              </div>
              <div className="text-muted mt-0.5 text-[10px]">קונים: {c.buyerConnection.waitingBuyers.length} ממתינים · {c.buyerConnection.matchingBuyers.length} מתאימים · {c.buyerConnection.priorityBuyers.length} בעדיפות</div>
              {c.risks[0] && <div className="text-rose-700 mt-0.5 text-[11px]">⚠️ {c.risks.slice(0, 3).map((r) => r.title).join(" · ")}</div>}
              {c.strategy.playbook[0] && <div className="text-muted text-[10px]">Playbook: {c.strategy.playbook.slice(0, 3).map((a) => `${a.order}. ${a.action}`).join(" ← ")}{c.strategy.requiredApprovals.length ? ` · אישורים: ${c.strategy.requiredApprovals.join(",")}` : ""}</div>}
              <div className="mt-1"><StartWorkflowButton entityType="seller" entityId={c.id} entityName={c.name} hints={c.health.churnRisk >= 55 ? ["at_risk"] : []} compact sourceTitle={c.aiRecommendation} /></div>
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Seller Agent v{data.version} · ההמלצות זורמות לתיבת הסוכנים · אין ביצוע אוטומטי</p>
        </div>
      )}
    </section>
  );
}

// ── Ask ZONO — conversational intelligence (30.1) ───────────────────────────
type AskMsg = { role: "user" | "assistant"; text: string; at: string; resp?: AskZonoResponse };
const ASK_SUGGESTIONS = ["מה עליי לעשות היום?", "אילו מוכרים בסיכון נטישה?", "אילו קונים קרובים לסגירה?", "אילו נכסים דורשים הורדת מחיר?", "היכן לגייס מתווכים?", "אילו הזדמנויות עסקה פתוחות?"];

// Batch 4.6 — a stable per-browser chat session so conversations persist + resume.
const newAskSessionId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const initAskSession = (): string => {
  if (typeof window === "undefined") return "";
  try {
    let sid = localStorage.getItem("zono_ask_session") ?? "";
    if (!sid) { sid = newAskSessionId(); localStorage.setItem("zono_ask_session", sid); }
    return sid;
  } catch { return newAskSessionId(); }
};

function AskZonoPanel() {
  const [messages, setMessages] = useState<AskMsg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(initAskSession);

  // Rehydrate this session's history from the EXISTING zono_ask_* store (async).
  useEffect(() => {
    if (!sessionId) return;
    getAskHistoryAction(sessionId).then((turns) => { if (turns.length) setMessages(turns.map((t) => ({ role: t.role, text: t.text, at: t.at }))); }).catch(() => {});
  }, [sessionId]);

  const clearConversation = () => {
    const sid = newAskSessionId();
    try { localStorage.setItem("zono_ask_session", sid); } catch { /* ignore */ }
    setSessionId(sid); setMessages([]);
  };

  const ask = async (q: string) => {
    const query = q.trim(); if (!query || pending) return;
    setErr(null); setInput("");
    const now = new Date().toISOString();
    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, text: m.text, intent: m.resp?.understanding.intent, at: m.at }));
    setMessages((prev) => [...prev, { role: "user", text: query, at: now }]);
    setPending(true);
    try {
      const r = await askZonoAction(query, history, sessionId ? { sessionId } : undefined);
      if (r.ok && r.result) setMessages((prev) => [...prev, { role: "assistant", text: r.result!.answer.executiveAnswer, at: new Date().toISOString(), resp: r.result }]);
      else setErr(r.error ?? "נכשל");
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); }
  };

  return (
    <section className="rounded-3xl border-2 border-sky-600/50 bg-sky-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-sky-800">💬 Ask ZONO — שאל את המערכת</h2>
          <p className="text-muted mt-1 text-[12px]">ממשק שיחה אחד מעל כל המנועים. שאל בשפה חופשית — ZONO מזהה כוונה, טוען רק את המנועים הנדרשים, ומחזיר תשובה עם נימוק, ראיות, מקורות, ביטחון והצעות פעולה (לאישור בלבד — ללא ביצוע אוטומטי).</p>
        </div>
        {messages.length > 0 && <button onClick={clearConversation} className="text-muted rounded-lg border border-sky-300 px-3 py-1 text-[11px] font-bold">נקה שיחה</button>}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ASK_SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} disabled={pending} className="rounded-full border border-sky-300 bg-sky-100/50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 disabled:opacity-50">{s}</button>)}
      </div>

      {messages.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={cn("rounded-xl px-3 py-2 text-[12px]", m.role === "user" ? "bg-sky-100/70 self-end max-w-[85%]" : "border-line bg-surface border")}>
              {m.role === "user" ? <span className="text-ink font-bold">{m.text}</span> : m.resp ? <AskAnswerView resp={m.resp} onFollowUp={ask} /> : <span className="text-ink whitespace-pre-wrap">{m.text}</span>}
            </div>
          ))}
        </div>
      )}
      {pending && <p className="text-muted mt-2 text-[11px]">חושב…</p>}
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}

      <div className="mt-3 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(input); }} placeholder="שאל שאלה… (למשל: אילו מוכרים בסיכון?)" className="border-line bg-surface flex-1 rounded-xl border px-3 py-2 text-[12px]" />
        <button onClick={() => ask(input)} disabled={pending || !input.trim()} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">שאל</button>
      </div>
    </section>
  );
}

function AskAnswerView({ resp, onFollowUp }: { resp: AskZonoResponse; onFollowUp: (q: string) => void }) {
  const a = resp.answer;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-ink font-bold">{a.executiveAnswer}</p>
      <p className="text-muted text-[11px]">🧠 {a.reasoning}</p>
      {a.recommendations.length > 0 && (
        <div className="text-[11px]"><span className="text-sky-800 font-bold">המלצות:</span> <span className="text-muted">{a.recommendations.slice(0, 4).join(" · ")}</span></div>
      )}
      {a.risks.length > 0 && <div className="text-rose-700 text-[11px]">⚠️ {a.risks.join(" · ")}</div>}
      {a.opportunities.length > 0 && <div className="text-emerald-700 text-[11px]">✨ {a.opportunities.join(" · ")}</div>}
      {a.actions.length > 0 && (
        <div className="text-[11px]"><span className="text-sky-800 font-bold">פעולות (לאישור):</span> <span className="text-muted">{a.actions.slice(0, 3).map((x) => x.title).join(" · ")}</span></div>
      )}
      <div className="text-muted mt-0.5 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="rounded-full bg-sky-100 px-2 py-0.5 font-bold text-sky-800">ביטחון {a.confidence}%</span>
        <span>מקורות: {a.explain.sourceEngines.map((e) => ENGINE_HE[e]).join(", ") || "—"}</span>
      </div>
      {a.evidence.length > 0 && <details className="text-[10px]"><summary className="text-muted cursor-pointer font-semibold">ראיות ומגבלות</summary><div className="text-muted mt-1">ראיות: {a.evidence.slice(0, 5).join(" · ")}<br />מגבלות: {a.explain.limitations.join(" · ")}</div></details>}
      {a.followUps.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {a.followUps.map((f) => <button key={f} onClick={() => onFollowUp(f)} className="rounded-full border border-sky-300 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{f}</button>)}
        </div>
      )}
    </div>
  );
}

// ── Multi-Agent Orchestrator — cross-agent dashboard (29.8) ─────────────────
function OrchestratorPanel() {
  const [data, setData] = useState<OrchestratorOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getOrchestratorDashboardAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-fuchsia-600/50 bg-fuchsia-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-fuchsia-800">🕸️ מנצח הסוכנים — תזמור רב-סוכני</h2>
          <p className="text-muted mt-1 text-[12px]">הסוכנים כבר לא פועלים לבד — הם משתפים פעולה: אירועים בין-סוכניים, שרשראות הזדמנות (קונה חם + מוכר מוכן + נכס בריא = עסקה), תור עדיפויות, פתרון קונפליקטים ותוכניות ביצוע מאוחדות. הכול לאישור בלבד — ללא ביצוע אוטומטי.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-fuchsia-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מתזמר…" : "הפעל תזמור"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="אירועים" value={fmt(data.totals.events)} />
            <Mini label="הזדמנויות" value={fmt(data.totals.opportunities)} tone="green" />
            <Mini label="עסקאות פוטנציאליות" value={fmt(data.totals.potentialDeals)} tone="green" />
            <Mini label="קונפליקטים" value={fmt(data.totals.conflicts)} tone={data.totals.conflicts ? "amber" : undefined} />
            <Mini label="תוכניות" value={fmt(data.totals.plans)} />
            <Mini label="עדיפות גבוהה" value={fmt(data.totals.highPriority)} tone="red" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.opportunities.length > 0 && (
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">שרשראות הזדמנות</p>
              {data.opportunities.slice(0, 5).map((o) => (
                <div key={o.id} className="mb-2 last:mb-0">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-fuchsia-800 font-bold">{o.type === "potential_deal" ? "💰 " : o.type === "buyer_listing_match" ? "🎯 " : o.type === "defend_market" ? "🛡️ " : "🔁 "}{o.title}</span>
                    <span className="text-[10px]"><span className="text-fuchsia-700 font-bold">ציון {o.opportunityScore}</span> · ביטחון {o.confidence}%{o.requiredApprovals.length ? ` · אישורים: ${o.requiredApprovals.join(",")}` : ""}</span>
                  </div>
                  <div className="text-muted text-[10px]">{o.links.map((l) => `${AGENT_HE[l.agent]}: ${l.role}`).join(" → ")}</div>
                  <div className="text-muted text-[10px]">{o.why}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">תור עדיפויות</p>
              {data.priorityQueue.slice(0, 6).map((p) => (
                <div key={p.id} className="text-muted flex items-center justify-between text-[11px]">
                  <span>{p.kind === "opportunity" ? "✨" : "•"} {p.title}</span>
                  <span className={cn("font-bold", p.priorityScore >= 70 ? "text-rose-700" : "text-fuchsia-700")}>{p.priorityScore}</span>
                </div>
              ))}
              {!data.priorityQueue.length && <p className="text-muted text-[11px]">אין פריטים בתור.</p>}
            </div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">אירועים בין-סוכניים</p>
              {data.events.slice(0, 6).map((e) => (
                <div key={e.id} className="text-muted text-[11px]"><span className="text-fuchsia-700 font-bold">{EVENT_HE[e.type]}</span> — {e.summary} <span className="text-[10px]">({AGENT_HE[e.source]})</span></div>
              ))}
              {!data.events.length && <p className="text-muted text-[11px]">אין אירועים פעילים.</p>}
            </div>
          </div>

          {data.conflicts.length > 0 && (
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">קונפליקטים והכרעה</p>
              {data.conflicts.slice(0, 4).map((c) => (
                <div key={c.id} className="mb-1 last:mb-0 text-[11px]">
                  <span className="text-ink font-bold">{c.entityLabel}: </span>
                  <span className="text-muted">{c.positions.map((p) => `${AGENT_HE[p.agent]}=${STANCE_HE[p.stance]}`).join(" ✗ ")}</span>
                  <span className="text-emerald-700 font-bold"> ← {AGENT_HE[c.resolution.winner]}: {c.resolution.action}</span>
                </div>
              ))}
            </div>
          )}

          {data.executionPlans.length > 0 && (
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">תוכניות ביצוע מאוחדות</p>
              {data.executionPlans.slice(0, 3).map((pl) => (
                <div key={pl.id} className="text-muted mb-1 last:mb-0 text-[11px]">
                  <span className="text-ink font-bold">{pl.title}: </span>
                  {pl.steps.slice(0, 4).map((s) => `${s.order}. ${s.action} (${AGENT_HE[s.owner]})`).join(" ← ")}{pl.requiredApprovals.length ? ` · אישורים: ${pl.requiredApprovals.join(",")}` : ""}
                </div>
              ))}
            </div>
          )}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Multi-Agent Orchestrator v{data.version} · תזמור בלבד — ההמלצות זורמות לתיבת הסוכנים · אין ביצוע אוטומטי</p>
        </div>
      )}
    </section>
  );
}

// ── Office Growth Agent — brokerage-level scorecard (29.7) ───────────────────
function OfficeGrowthPanel() {
  const [data, setData] = useState<OfficeGrowthOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getOfficeGrowthScorecardAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };
  const c = data?.scorecard ?? null;

  return (
    <section className="rounded-3xl border-2 border-indigo-600/50 bg-indigo-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-indigo-800">🏢 סוכן צמיחת המשרד — ניהול העסק עצמו</h2>
          <p className="text-muted mt-1 text-[12px]">לא מנהל אדם — מנהל את עסק התיווך: בריאות עסקית, מלאי, מתווכים, תחרות, משפכים ואסטרטגיית צמיחה עם Playbook והחלטות מוסברות. המלצה בלבד — ללא ביצוע אוטומטי, הכול דרך תיבת הסוכנים.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-indigo-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח עסק…" : "הפעל סוכן צמיחה"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && !c && <p className="text-muted mt-3 text-[12px]">{data.notes.join(" · ") || "אין נתונים."}</p>}
      {data && c && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Mini label="בריאות עסקית" value={fmt(c.health.businessHealth)} tone={c.health.businessHealth >= 62 ? "green" : c.health.businessHealth < 45 ? "red" : undefined} />
            <Mini label="צמיחה" value={fmt(c.growthScore)} />
            <Mini label="מלאי" value={fmt(c.inventoryScore)} />
            <Mini label="מתווכים" value={fmt(c.brokerScore)} />
            <Mini label="מיקום שוק" value={fmt(c.marketPosition)} />
            <Mini label="מוכנות הרחבה" value={fmt(c.health.expansionReadiness)} />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          <div className="border-line bg-surface rounded-xl border px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-ink font-black">{c.name}</span>
              <span className="flex items-center gap-2 text-[10px]">
                <span className={cn("rounded-full px-2 py-0.5 font-bold", ["מצוינת", "בריאה"].includes(c.health.label) ? "bg-green-100 text-green-800" : c.health.label === "בסיכון" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800")}>{c.health.label}</span>
                {c.truthScore != null ? <span className="text-muted">אמון נתונים {c.truthScore}</span> : null}
              </span>
            </div>
            <div className="text-indigo-800 mt-1 rounded-lg border border-indigo-600/30 bg-indigo-50/40 px-2 py-1 text-[11px] font-bold">
              🎯 {OFFICE_STRATEGY_HE[c.strategy.recommendedStrategy] ?? c.strategy.recommendedStrategy} · ביטחון {c.strategy.confidence}% · {c.strategy.change.signal === "switch" ? "החלף אסטרטגיה" : c.strategy.change.signal === "succeeded" ? "בהצלחה" : c.strategy.change.signal === "failed" ? "נסיגה" : "פעיל"}
              <span className="text-muted font-normal"> — {c.aiRecommendation}</span>
            </div>
            <div className="text-muted mt-1 text-[10px]">Playbook: {c.strategy.playbook.slice(0, 3).map((a) => `${a.order}. ${a.action}`).join(" ← ")}{c.strategy.requiredApprovals.length ? ` · אישורים: ${c.strategy.requiredApprovals.join(",")}` : ""}</div>
            <div className="mt-1"><StartWorkflowButton entityType="office" entityId={c.id} entityName={c.name} hints={["recruit"]} compact sourceTitle={c.aiRecommendation} /></div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">משפכים</p>
              {c.pipeline.stages.map((s) => (
                <div key={s.name} className="text-muted flex items-center justify-between text-[11px]">
                  <span>{s.name} <span className="text-[10px]">({s.volume})</span></span>
                  <span className={cn("font-bold", s.health >= 60 ? "text-green-700" : s.health < 45 ? "text-rose-700" : "text-amber-700")}>{s.health}{s.bottleneck ? <span className="text-rose-600 font-normal"> · {s.bottleneck}</span> : null}</span>
                </div>
              ))}
            </div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">החלטות מומלצות</p>
              {c.decisions.slice(0, 5).map((d, i) => (
                <div key={i} className="text-muted text-[11px]"><span className="text-indigo-700 font-bold">{OFFICE_DECISION_HE[d.type]}</span> — {d.title}{d.requiresApproval ? <span className="text-[10px]"> (אישור)</span> : null}</div>
              ))}
              {!c.decisions.length && <p className="text-muted text-[11px]">אין החלטות דחופות.</p>}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">מלאי</p>
              {c.inventory.slice(0, 4).map((f, i) => <div key={i} className="text-muted text-[11px]">• {f.title}</div>)}
              {!c.inventory.length && <p className="text-muted text-[11px]">מאוזן.</p>}
            </div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">מתווכים</p>
              {c.brokerFindings.slice(0, 4).map((f, i) => <div key={i} className="text-muted text-[11px]">• {f.title}</div>)}
              {!c.brokerFindings.length && <p className="text-muted text-[11px]">אין ממצאים.</p>}
            </div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <p className="text-ink mb-1 font-bold">תחרות</p>
              {c.competitive.slice(0, 4).map((f, i) => <div key={i} className="text-muted text-[11px]">• {f.title}</div>)}
              {!c.competitive.length && <p className="text-muted text-[11px]">אין אותות.</p>}
            </div>
          </div>

          {c.risks[0] && <div className="text-rose-700 text-[11px]">⚠️ סיכונים: {c.risks.slice(0, 4).map((r) => r.title).join(" · ")}</div>}
          {c.opportunities[0] && <div className="text-emerald-700 text-[11px]">✨ הזדמנויות: {c.opportunities.slice(0, 4).map((o) => o.title).join(" · ")}</div>}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Office Growth Agent v{data.version} · ההמלצות זורמות לתיבת הסוכנים · אין ביצוע אוטומטי</p>
        </div>
      )}
    </section>
  );
}

// ── Lead Intelligence Agent — per-lead scorecards (29.6) ─────────────────────
function LeadAgentPanel() {
  const [data, setData] = useState<LeadAgentScorecardsOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getLeadAgentScorecardsAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-violet-500/50 bg-violet-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-violet-800">🎯 סוכן מודיעין לידים — כרטיס לכל ליד</h2>
          <p className="text-muted mt-1 text-[12px]">מגע ראשון: מסווג כל ליד, מזהה כוונה, מונע כפילויות, ומנתב לקונה/מוכר/שניהם/טיפוח עם אסטרטגיה ו-Playbook מוסברים. ניתוב והמרה הן הצעות לאישור בלבד — ללא ביצוע אוטומטי, הכול דרך תיבת הסוכנים.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-violet-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח לידים…" : "הפעל סוכן לידים"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
            <Mini label="לידים" value={fmt(data.totals.leads)} />
            <Mini label="חמים" value={fmt(data.totals.hot)} tone="green" />
            <Mini label="כפילויות" value={fmt(data.totals.duplicates)} tone="red" />
            <Mini label="→ קונה" value={fmt(data.totals.buyers)} />
            <Mini label="→ מוכר" value={fmt(data.totals.sellers)} />
            <Mini label="→ שניהם" value={fmt(data.totals.both)} tone="green" />
            <Mini label="טיפוח" value={fmt(data.totals.nurture)} tone="amber" />
            <Mini label="בדיקה אנושית" value={fmt(data.totals.humanReview)} tone="amber" />
            <Mini label="מוכן להמרה" value={fmt(data.totals.convertReady)} tone="green" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.scorecards.slice(0, 6).map((c) => (
            <div key={c.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{c.name}{c.classification.length ? <span className="text-violet-700 font-bold"> · {c.classification.slice(0, 3).join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", c.health.label === "בריא" ? "bg-green-100 text-green-800" : c.health.label === "בסיכון" || c.health.label === "רדום" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800")}>{c.health.label}</span>
                  <span className="text-muted">בריאות {c.health.leadHealth} · המרה {c.health.conversionProbability} · כוונה {c.health.intentConfidence}</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                כוונה: <span className="font-bold text-violet-700">{c.intent.fit} ({c.intent.confidence}%)</span> · ניתוב מומלץ: <span className="font-bold text-violet-700">{ROUTING_HE[c.routing.target]}</span> · נגישות {c.health.contactability} · כפילות {c.health.duplicateRisk} · שלמות {c.health.dataCompleteness}
                {c.truthScore != null ? <span> · אמת {c.truthScore}</span> : null}
              </div>
              <div className="text-violet-800 mt-1 rounded-lg border border-violet-600/30 bg-violet-50/40 px-2 py-1 text-[11px] font-bold">
                🎯 {LEAD_STRATEGY_HE[c.strategy.recommendedStrategy] ?? c.strategy.recommendedStrategy} · ביטחון {c.strategy.confidence}% · {c.strategy.change.signal === "switch" ? "החלף אסטרטגיה" : c.strategy.change.signal === "succeeded" ? "הומר" : c.strategy.change.signal === "failed" ? "התקרר" : "פעיל"}
                <span className="text-muted font-normal"> — {c.aiRecommendation}</span>
              </div>
              {c.opportunities[0] && <div className="text-emerald-700 mt-0.5 text-[11px]">✨ {c.opportunities.slice(0, 3).map((o) => o.title).join(" · ")}</div>}
              {c.risks[0] && <div className="text-rose-700 mt-0.5 text-[11px]">⚠️ {c.risks.slice(0, 3).map((r) => r.title).join(" · ")}</div>}
              {c.strategy.playbook[0] && <div className="text-muted text-[10px]">Playbook: {c.strategy.playbook.slice(0, 3).map((a) => `${a.order}. ${a.action}`).join(" ← ")}{c.strategy.requiredApprovals.length ? ` · אישורים: ${c.strategy.requiredApprovals.join(",")}` : ""}</div>}
              <div className="text-muted mt-0.5 text-[10px]">{c.routing.note}</div>
              <div className="mt-1"><StartWorkflowButton entityType="lead" entityId={c.id} entityName={c.name} hints={["qualify", c.routing.target]} compact sourceTitle={c.aiRecommendation} /></div>
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Lead Agent v{data.version} · ההמלצות זורמות לתיבת הסוכנים · אין המרה/ביצוע אוטומטי</p>
        </div>
      )}
    </section>
  );
}

// ── Buyer Intelligence Agent — per-buyer scorecards (29.4) ───────────────────
function BuyerAgentPanel() {
  const [data, setData] = useState<BuyerAgentScorecardsOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getBuyerAgentScorecardsAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-cyan-500/50 bg-cyan-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-cyan-800">🛒 סוכן מודיעין קונים — כרטיס לכל קונה</h2>
          <p className="text-muted mt-1 text-[12px]">סוכן AI לכל קונה: בריאות, מוכנות, התאמות נכס, סיכונים ואסטרטגיית קנייה מוסברת (מהלך מסודר). המלצה בלבד — אין ביצוע אוטומטי, הכול דרך תיבת הסוכנים.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-cyan-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח קונים…" : "הפעל סוכן קונים"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="קונים" value={fmt(data.totals.buyers)} />
            <Mini label="חמים" value={fmt(data.totals.hot)} tone="green" />
            <Mini label="קרים" value={fmt(data.totals.cold)} tone="red" />
            <Mini label="בסגירה" value={fmt(data.totals.closing)} tone="green" />
            <Mini label="חסר מידע" value={fmt(data.totals.needsInfo)} tone="amber" />
            <Mini label="רדומים" value={fmt(data.totals.dormant)} />
            <Mini label="עם התאמות" value={fmt(data.totals.withMatches)} />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.scorecards.slice(0, 6).map((c) => (
            <div key={c.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{c.name}{c.classification.length ? <span className="text-cyan-700 font-bold"> · {c.classification.join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", c.health.label === "בריא" ? "bg-green-100 text-green-800" : c.health.label === "בסיכון" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800")}>{c.health.label}</span>
                  <span className="text-muted">בריאות {c.health.buyerHealth} · קנייה {c.health.buyingConfidence}%</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                מוכנות {c.health.buyingReadiness} · מומנטום {c.health.buyingMomentum} · אמון {c.health.trust} · תקשורת {c.health.communicationHealth} · יחסים {c.health.relationshipHealth}
                {c.truthScore != null ? <span> · אמת {c.truthScore}</span> : null}
                {c.lifecycleRoles.length ? <span> · תפקידים: {c.lifecycleRoles.join(",")}</span> : null}
              </div>
              <div className="text-cyan-800 mt-1 rounded-lg border border-cyan-500/30 bg-cyan-50/40 px-2 py-1 text-[11px] font-bold">
                🎯 {BUYER_STRATEGY_HE[c.strategy.recommendedStrategy] ?? c.strategy.recommendedStrategy} · ביטחון {c.strategy.confidence}% · {c.strategy.change.signal === "switch" ? "החלף אסטרטגיה" : c.strategy.change.signal === "succeeded" ? "בהצלחה" : "פעיל"}
                <span className="text-muted font-normal"> — {c.aiRecommendation}</span>
              </div>
              <div className="text-muted mt-0.5 text-[10px]">התאמות: {c.matchIntel.perfect.length} מושלמות · {c.matchIntel.emerging.length} מתפתחות · {c.matchIntel.hidden.length} נסתרות{c.matchIntel.expired.length ? ` · ${c.matchIntel.expired.length} פגות` : ""}</div>
              {c.risks[0] && <div className="text-rose-700 mt-0.5 text-[11px]">⚠️ {c.risks.slice(0, 3).map((r) => r.title).join(" · ")}</div>}
              {c.strategy.playbook[0] && <div className="text-muted text-[10px]">Playbook: {c.strategy.playbook.slice(0, 3).map((a) => `${a.order}. ${a.action}`).join(" ← ")}</div>}
              <div className="mt-1"><StartWorkflowButton entityType="buyer" entityId={c.id} entityName={c.name} hints={["hot"]} compact sourceTitle={c.aiRecommendation} /></div>
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Buyer Agent v{data.version} · ההמלצות זורמות לתיבת הסוכנים · אין ביצוע אוטומטי</p>
        </div>
      )}
    </section>
  );
}

// ── Listing Intelligence Agent — per-property scorecards (29.3) ──────────────
function ListingAgentPanel() {
  const [data, setData] = useState<ListingScorecardsOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getListingScorecardsAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-orange-500/50 bg-orange-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-orange-800">🏠 סוכן מודיעין מודעות — כרטיס לכל נכס</h2>
          <p className="text-muted mt-1 text-[12px]">סוכן AI לכל נכס: מנטר בריאות, ביקוש, זמן בשוק, תמחור ותחרות, וממליץ פרואקטיבית (תמחור/שיווק/מוכר/קונים). המלצה בלבד — אין ביצוע אוטומטי.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-orange-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח נכסים…" : "הפעל סוכן מודעות"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="נכסים" value={fmt(data.totals.properties)} />
            <Mini label="בריאים" value={fmt(data.totals.healthy)} tone="green" />
            <Mini label="קריטיים" value={fmt(data.totals.critical)} tone="red" />
            <Mini label="יוקרה" value={fmt(data.totals.luxury)} />
            <Mini label="מתיישנים" value={fmt(data.totals.stale)} tone="amber" />
            <Mini label="הזדמנות גבוהה" value={fmt(data.totals.highOpportunity)} tone="green" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.scorecards.slice(0, 6).map((c) => (
            <div key={c.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{c.title}{c.classification.length ? <span className="text-orange-700 font-bold"> · {c.classification.join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", c.health.label === "בריא" ? "bg-green-100 text-green-800" : c.health.label === "קריטי" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800")}>{c.health.label}</span>
                  <span className="text-muted">בריאות {c.health.listingHealth} · דחיפות {c.health.urgency}</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                תמחור {c.health.pricingHealth} · שיווק {c.health.marketingHealth} · ביקוש {c.health.demand} · לחץ תחרות {c.health.competitionPressure} · משימות {c.activeMissions}
                {c.truthScore != null ? <span> · אמת {c.truthScore}</span> : null} · ביטחון {c.aiConfidence}%
              </div>
              {/* Valuation badge (29.3.1) */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                {c.valuation.available ? (
                  <>
                    <span className={cn("rounded-full px-2 py-0.5 font-bold", c.valuation.rangePosition === "above" ? "bg-rose-100 text-rose-800" : c.valuation.rangePosition === "below" ? "bg-sky-100 text-sky-800" : "bg-green-100 text-green-800")}>
                      {c.valuation.rangePosition === "above" ? "מעל טווח" : c.valuation.rangePosition === "below" ? "מתחת לטווח" : "בתוך הטווח"}
                    </span>
                    <span className="text-muted">מבוקש {c.price ? c.price.toLocaleString("he-IL") : "—"} ₪ מול הערכה {c.valuation.estimatedValue ? c.valuation.estimatedValue.toLocaleString("he-IL") : "—"} ₪{c.valuation.priceGapPct != null ? ` (${c.valuation.priceGapPct > 0 ? "+" : ""}${c.valuation.priceGapPct}%)` : ""}</span>
                    <span className="text-muted">ביטחון הערכה {c.valuation.confidenceLabel}{c.valuation.fresh ? "" : ` · מיושנת (${c.valuation.ageDays} ימים)`}</span>
                  </>
                ) : (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-600">אין הערכת שווי זמינה</span>
                )}
              </div>
              {/* Market performance (29.3.2) */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                <span className={cn("rounded-full px-2 py-0.5 font-bold", c.marketPerformance.score >= 66 ? "bg-green-100 text-green-800" : c.marketPerformance.score >= 40 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800")}>ביצוע שוק {c.marketPerformance.score}</span>
                <span className="text-muted">מיקום: {c.marketPerformance.marketPosition === "above" ? "מעל השוק" : c.marketPerformance.marketPosition === "below" ? "מתחת לשוק" : c.marketPerformance.marketPosition === "at" ? "בקצב השוק" : "לא ידוע"} · מגמה {c.marketPerformance.trend === "improving" ? "משתפרת" : c.marketPerformance.trend === "declining" ? "יורדת" : "יציבה"}</span>
                <span className="text-muted">DOM {c.marketPerformance.domVsMarket.days ?? "—"} מול חציון {c.marketPerformance.domVsMarket.median ?? "—"} ({c.marketPerformance.domVsMarket.band === "fast" ? "מהיר" : c.marketPerformance.domVsMarket.band === "normal" ? "בקצב" : c.marketPerformance.domVsMarket.band === "slow" ? "איטי" : c.marketPerformance.domVsMarket.band === "very_slow" ? "איטי מאוד" : "—"})</span>
                <span className="text-muted">ביקוש {c.marketPerformance.buyerDemand.demandScore} ({c.marketPerformance.buyerDemand.activeMatches} התאמות · {c.marketPerformance.buyerDemand.perfectMatches} מושלמות)</span>
              </div>
              {c.marketPerformance.insights[0] && <div className="text-muted mt-1 text-[11px]">📊 {c.marketPerformance.insights.slice(0, 3).map((i) => i.text).join(" · ")}</div>}
              {/* Strategy (29.3.3) */}
              <div className="mt-1 rounded-lg border border-orange-500/30 bg-orange-50/40 px-2 py-1.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-orange-900">🎯 אסטרטגיה: {STRATEGY_HE[c.strategy.recommendedStrategy] ?? c.strategy.recommendedStrategy}</span>
                  <span className="text-muted text-[10px]">נוכחית: {STRATEGY_HE[c.strategy.currentStrategy] ?? c.strategy.currentStrategy} · ביטחון {c.strategy.confidence}% · ROI {c.strategy.estimatedRoi}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", c.strategy.change.signal === "switch" ? "bg-amber-100 text-amber-800" : c.strategy.change.signal === "failed" ? "bg-rose-100 text-rose-800" : c.strategy.change.signal === "succeeded" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700")}>{c.strategy.change.signal === "switch" ? "החלף אסטרטגיה" : c.strategy.change.signal === "working" ? "עובדת" : c.strategy.change.signal === "failed" ? "נכשלה" : c.strategy.change.signal === "succeeded" ? "הצליחה" : "לבחינה"}</span>
                </div>
                {c.strategy.why[0] && <div className="text-muted mt-0.5 text-[10px]">למה: {c.strategy.why.join(" · ")} · תוצאה: {c.strategy.expectedOutcome}</div>}
                {c.strategy.playbook[0] && <div className="text-muted mt-0.5 text-[10px]">Playbook: {c.strategy.playbook.slice(0, 3).map((a) => `${a.order}. ${a.action}`).join(" ← ")}{c.strategy.expectedDurationDays ? ` · ${c.strategy.expectedDurationDays} ימים` : ""}</div>}
                {c.strategy.requiredApprovals.length > 0 && <div className="text-muted mt-0.5 text-[10px]">אישורים: {c.strategy.requiredApprovals.join(", ")}{c.strategy.sellerAlignment.notes.length ? ` · ${c.strategy.sellerAlignment.notes[0]}` : ""}</div>}
              </div>
              {c.risks[0] && <div className="text-rose-700 mt-1 text-[11px]">⚠️ {c.risks.slice(0, 3).map((r) => r.title).join(" · ")}</div>}
              {c.recommendations[0] && <div className="text-orange-800 mt-1 text-[11px] font-bold">← {c.recommendations[0].action} (עדיפות {c.recommendations[0].priority}, ROI: {c.recommendations[0].roi})</div>}
              {c.recommendations[1] && <div className="text-muted text-[11px]">גם: {c.recommendations.slice(1, 3).map((r) => r.action).join(" · ")}</div>}
              <div className="mt-1"><StartWorkflowButton entityType="property" entityId={c.id} entityName={c.title} hints={[c.health.label === "קריטי" ? "critical" : "stale", c.classification.includes("יוקרה") ? "luxury" : ""]} compact sourceTitle={c.strategy.recommendedStrategy} /></div>
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Listing Agent v{data.version} · ההמלצות זורמות גם לתיבת הסוכנים · אין ביצוע אוטומטי</p>
        </div>
      )}
    </section>
  );
}

// ── Autonomous AI Agent Framework — AI Agents dashboard (29.1) ───────────────
function AgentsPanel() {
  const [data, setData] = useState<AgentsDashboard | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getAgentsDashboardAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };
  const toggle = async (id: string, enabled: boolean) => { setBusy(id); try { await setAgentEnabledAction(id, enabled); await run(); } finally { setBusy(null); } };
  const approve = async (id: string) => { setBusy(id); try { await approveInboxItemAction(id); await run(); } finally { setBusy(null); } };
  const reject = async (id: string) => { setBusy(id); try { await rejectInboxItemAction(id, "נדחה ידנית"); await run(); } finally { setBusy(null); } };

  return (
    <section className="rounded-3xl border-2 border-slate-500/50 bg-slate-50/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-slate-800">🤖 סוכני AI — מסגרת סוכנים אוטונומית</h2>
          <p className="text-muted mt-1 text-[12px]">מסגרת אחת לכל הסוכנים העתידיים: תצפית → הסקה → תכנון → הצעות לאישור. שום דבר לא מבוצע אוטומטית. שני סוכני דמו: תדריך יומי ומעקב משימות.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-slate-800 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מריץ סוכנים…" : "הרץ סוכנים"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="סוכנים" value={fmt(data.totals.agents)} />
            <Mini label="פעילים" value={fmt(data.totals.active)} tone="green" />
            <Mini label="מושבתים" value={fmt(data.totals.disabled)} />
            <Mini label="המלצות" value={fmt(data.totals.recommendations)} />
            <Mini label="ממתין לאישור" value={fmt(data.totals.needsApproval)} tone="amber" />
            <Mini label="חסום" value={fmt(data.totals.blocked)} tone="red" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {/* Agents */}
          <div className="grid gap-2 lg:grid-cols-2">
            {data.agents.map((a) => (
              <div key={a.id} className="border-line bg-surface rounded-xl border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-ink font-bold">{a.name} <span className="text-muted font-normal">· {a.type}</span></span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-muted">בריאות {a.health} · ממתין {a.pendingApprovals}</span>
                    <button onClick={() => toggle(a.id, a.status !== "enabled")} disabled={busy === a.id} className={cn("rounded-full px-2 py-0.5 font-bold", a.status === "enabled" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600")}>{a.status === "enabled" ? "פעיל" : "מושבת"}</button>
                  </div>
                </div>
                <div className="text-muted mt-0.5 text-[11px]">{a.description}</div>
                <div className="text-muted mt-0.5 text-[10px]">הרשאות: {a.permissions.join(", ")} · לו״ז: {a.schedule.mode} · ריצה אחרונה: {a.lastRunAt ? new Date(a.lastRunAt).toLocaleString("he-IL") : "—"}{a.nextRunAt ? ` · הבאה: ${new Date(a.nextRunAt).toLocaleDateString("he-IL")}` : ""} · המלצות {a.performance.recommendations}</div>
              </div>
            ))}
          </div>

          {/* Inbox — persists across refresh/deploy; approve/reject */}
          {data.inbox.length > 0 && (
            <div>
              <b>📥 תיבת סוכנים — ממתין לאישור (נשמר, לא מבוצע אוטומטית):</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.inbox.slice(0, 12).map((i) => (
                  <div key={i.id} className={cn("border-line bg-surface rounded-lg border px-3 py-1.5", i.blocked && "opacity-60", i.status === "approved" && "border-green-400/60", i.status === "rejected" && "border-rose-300/60")}>
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-ink font-bold">{i.recommendation} <span className="text-muted font-normal">· {i.agentName} · {i.entity}</span></span>
                      <span className="flex items-center gap-2 text-[10px]">
                        <span className={cn("rounded-full px-2 py-0.5 font-bold", i.impact === "high" ? "bg-rose-100 text-rose-800" : i.impact === "medium" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>{i.impact}</span>
                        <span className="text-muted">דחיפות {i.urgency} · ביטחון {i.confidence}%</span>
                        {i.blocked ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">חסום</span>
                          : i.status === "approved" ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800 font-bold">אושר{i.createdMissionId ? " · נוצרה משימה" : ""}</span>
                          : i.status === "rejected" ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 font-bold">נדחה</span>
                          : <span className="flex items-center gap-1">
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 font-bold">דורש אישור</span>
                              <button onClick={() => approve(i.id)} disabled={busy === i.id} className="rounded-lg bg-green-700 px-2 py-0.5 font-bold text-white disabled:opacity-60">אשר</button>
                              <button onClick={() => reject(i.id)} disabled={busy === i.id} className="rounded-lg bg-rose-700 px-2 py-0.5 font-bold text-white disabled:opacity-60">דחה</button>
                            </span>}
                      </span>
                    </div>
                    <div className="text-muted mt-0.5 text-[10px]">{i.explain.why} · אם יתעלמו: {i.explain.ifIgnored}{i.blockReason ? ` · ${i.blockReason}` : ""}{i.decisionReason ? ` · ${i.decisionReason}` : ""}</div>
                    {i.entityType && i.entityId && asWfKind(i.entityType) && i.status === "pending" && !i.blocked && (
                      <div className="mt-1"><StartWorkflowButton entityType={asWfKind(i.entityType)!} entityId={i.entityId} entityName={i.entityName ?? i.entity} hints={[i.missionType ?? ""]} compact sourceTitle={i.recommendation} label="התחל Workflow" /></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run history + performance over time */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BriefBlock title="🕓 היסטוריית ריצות" items={data.runs.slice(0, 6).map((r) => `${r.agentId} · ${new Date(r.ranAt).toLocaleString("he-IL")} · ${r.proposals} הצעות${r.skipped ? " (דילג)" : ""} · ${r.trigger}`)} />
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <b>📈 ביצועים לאורך זמן:</b>
              <ul className="mt-1 flex flex-col gap-0.5">
                {data.agents.map((a) => <li key={a.id} className="text-muted text-[11px]">{a.name}: המלצות {a.performance.recommendations} · אושרו {a.performance.approved} · נדחו {a.performance.rejected} · שיעור הצלחה {a.performance.successRatePct}% · נקודות היסטוריה {a.performanceHistory.length}</li>)}
              </ul>
            </div>
          </div>

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Agent Framework v{data.version} · נשמר · אין ביצוע אוטומטי{data.migrationRequired ? " · יש להריץ מיגרציית 29.2" : ""}</p>
        </div>
      )}
    </section>
  );
}

// ── Unified Customer Journey & Lifecycle Intelligence (28.5) ─────────────────
function CustomerJourneyPanel() {
  const [data, setData] = useState<CustomerJourneysOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getCustomerJourneysAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-rose-500/50 bg-rose-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-rose-800">🧭 מסע לקוח מאוחד — מודיעין מחזור חיים</h2>
          <p className="text-muted mt-1 text-[12px]">אדם אחד = לקוח אחד. ליד/קונה/מוכר מתאחדים לזהות אחת שעוברת שלבי מחזור חיים — היסטוריה משולבת, מעברים מוסברים, בריאות וערך חיים. אין כפילות אנשים.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-rose-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "בונה מסעות…" : "בנה מסעות לקוח"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Mini label="לקוחות" value={fmt(data.totals.customers)} />
            <Mini label="רב-תפקידי" value={fmt(data.totals.multiRole)} tone="green" />
            <Mini label="חוזרים" value={fmt(data.totals.repeat)} tone="green" />
            <Mini label="משקיעים" value={fmt(data.totals.investors)} />
            <Mini label="הפניות" value={fmt(data.totals.referrals)} />
            <Mini label="רדומים" value={fmt(data.totals.dormant)} tone="amber" />
            <Mini label="ערך גבוה" value={fmt(data.totals.highValue)} tone="green" />
            <Mini label="מעברים" value={fmt(data.totals.transitions)} />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.journeys.slice(0, 6).map((j) => (
            <div key={j.identity.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{j.identity.name} <span className="text-rose-700 font-bold">· {STAGE_HE[j.currentStage]}</span>{j.classification.length ? <span className="text-muted font-normal"> · {j.classification.join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold">LTV {j.health.lifetimeValue}</span>
                  <span className="text-muted">עתידי {j.health.futureValue} · נטישה {j.health.retentionRisk}</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                תפקידים: {j.identity.roles.map((r) => ROLE_HE[r]).join(" · ")} · {j.memory.totalActivities} פעילויות · אמון {j.health.trust} · הפניה {j.health.referralPotential}
                {j.health.ltvEstimate != null ? <span> · ערך ~{j.health.ltvEstimate.toLocaleString("he-IL")} ₪</span> : null}
              </div>
              {j.transitions.length > 0 && <div className="text-rose-800 mt-1 text-[11px] font-bold">מעברים: {j.transitions.map((t) => `${STAGE_HE[t.from]}→${STAGE_HE[t.to]} (${t.confidence}%)`).join(" · ")}</div>}
              {j.decisions[0] && <div className="text-muted text-[11px]">החלטה: {j.decisions[0].action} ({j.decisions[0].priority})</div>}
              {j.missions[0] && <div className="text-muted text-[11px]">משימות מחזור-חיים: {j.missions.slice(0, 3).map((m) => m.title).join(", ")}</div>}
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Customer Journey v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── CRM Relationship Graph Integration — dashboard (28.4) ────────────────────
function CrmRelationshipPanel() {
  const [data, setData] = useState<CrmDashboardResult | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getCrmGraphAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-violet-500/50 bg-violet-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-violet-800">🔗 גרף קשרי CRM — קונים · מוכרים · לידים</h2>
          <p className="text-muted mt-1 text-[12px]">מחבר את ה-Digital Twins של קונה/מוכר/ליד לגרף הישויות: המרות, התאמות נכס, הערכות שווי, בעלות מתווך, משימות וכפילויות — מראיות בלבד.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-violet-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "בונה גרף…" : "בנה גרף CRM"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="ישויות" value={fmt(data.dashboard.totals.nodes)} />
            <Mini label="קשרים" value={fmt(data.dashboard.totals.edges)} />
            <Mini label="המרות" value={fmt(data.dashboard.totals.conversions)} tone="green" />
            <Mini label="קונה↔נכס" value={fmt(data.dashboard.totals.buyerPropertyLinks)} />
            <Mini label="מוכר↔נכס" value={fmt(data.dashboard.totals.sellerPropertyLinks)} />
            <Mini label="כפילויות" value={fmt(data.dashboard.totals.duplicates)} tone="amber" />
            <Mini label="פערי קשר" value={fmt(data.dashboard.totals.gaps)} tone="red" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {/* Chief of Staff CRM understanding */}
          <div className="rounded-xl border border-violet-500/40 bg-surface px-3 py-2">
            <b className="text-violet-800">🧠 ה-Chief of Staff רואה קשרי CRM:</b>
            <ul className="mt-1 flex flex-col gap-0.5">{data.dashboard.chiefOfStaffStatements.map((s, i) => <li key={i} className="text-muted text-[11px]">• {s}</li>)}</ul>
          </div>

          {/* Conversion paths */}
          {data.dashboard.conversionPaths.length > 0 && (
            <div>
              <b>🛣️ מסלולי המרה:</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.dashboard.conversionPaths.slice(0, 6).map((p, i) => (
                  <div key={i} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5">
                    <span className="text-ink font-bold">{p.steps.join("  ←  ")}</span>
                    <span className="text-muted text-[10px]">עוצמה {p.strength}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strongest matches + seller links */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BriefBlock title="🏠 התאמות קונה↔נכס חזקות" items={data.dashboard.strongestBuyerPropertyMatches.map((m) => `${m.fromName} ↔ ${m.toName} (עוצמה ${m.strength})`)} />
            <BriefBlock title="🏷️ קישורי מוכר↔נכס/הערכה" items={[...data.dashboard.sellerPropertyLinks, ...data.dashboard.sellerValuationLinks].map((m) => `${m.fromName} ${RELATION_HE[m.type] ?? m.type} ${m.toName}`)} tone="green" />
          </div>

          {/* Broker ownership + duplicates + gaps */}
          <div className="grid gap-3 lg:grid-cols-3">
            <BriefBlock title="👔 בעלות מתווך" items={data.dashboard.brokerOwnership.map((b) => `${b.broker}: ${b.count} קשרים`)} />
            <BriefBlock title="👥 לידים כפולים" items={data.dashboard.duplicateLeads.map((d) => `${d.fromName} ↔ ${d.toName}`)} tone="red" />
            <BriefBlock title="⚠️ פערי קשר" items={data.dashboard.relationshipGaps.map((g) => `${g.name} (${g.type})`)} tone="red" />
          </div>

          <p className="text-muted text-[10px]">בריאות רשת {data.dashboard.networkHealth} · נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · CRM Graph v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── Lead Digital Twin — third Twin on the framework (28.3) ───────────────────
function LeadTwinPanel() {
  const [data, setData] = useState<LeadTwinsOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getLeadTwinsAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-amber-500/50 bg-amber-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-amber-800">🎯 Digital Twin — לידים (Twin שלישי על אותה מסגרת)</h2>
          <p className="text-muted mt-1 text-[12px]">הליד הוא ה-Twin השלישי: מקור, איכות, כוונה (קונה/מוכר), דחיפות, סיכוי המרה, סיכון כפילות/קשר והפעולה הבאה — מראיות בלבד.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-amber-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "בונה Twins…" : "בנה Lead Twins"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Mini label="לידים" value={fmt(data.totals.leads)} />
            <Mini label="חמים" value={fmt(data.totals.hot)} tone="green" />
            <Mini label="קרים" value={fmt(data.totals.cold)} tone="red" />
            <Mini label="קונים" value={fmt(data.totals.buyers)} />
            <Mini label="מוכרים" value={fmt(data.totals.sellers)} />
            <Mini label="כפילויות" value={fmt(data.totals.duplicates)} tone="amber" />
            <Mini label="מתיישנים" value={fmt(data.totals.stale)} />
            <Mini label="מוסמכים" value={fmt(data.totals.qualified)} tone="green" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.twins.slice(0, 6).map((t) => (
            <div key={t.identity.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{t.identity.name}{t.classification.length ? <span className="text-amber-700 font-bold"> · {t.classification.join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold">המרה {t.profile.conversionProbability}%</span>
                  <span className="text-muted">בריאות {t.health.score} · {t.health.label}</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                מקור {t.profile.source ?? "לא ידוע"} ({t.profile.sourceQuality}) · כוונה {t.profile.buyerSellerFit} ({t.profile.intentConfidence}%) · איכות {t.profile.leadQuality} · דחיפות {t.profile.urgency} · שלב {t.profile.stage}
                {t.profile.duplicateRisk >= 60 ? <span> · כפילות {t.profile.duplicateRisk}%</span> : null}
                {t.truth ? <span> · אמת נתונים {t.truth.truthScore}</span> : null}
              </div>
              <div className="text-amber-800 mt-1 text-[11px] font-bold">← הפעולה הבאה: {t.profile.nextBestAction}</div>
              {t.missions[0] && <div className="text-muted text-[11px]">משימות: {t.missions.slice(0, 3).map((m) => m.title).join(", ")}</div>}
              {t.learnings[0] && <div className="text-muted text-[11px]">למידה: {t.learnings[0].note}</div>}
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Lead Twin v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── Seller Digital Twin — second Twin on the framework (28.2) ────────────────
function SellerTwinPanel() {
  const [data, setData] = useState<SellerTwinsOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getSellerTwinsAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-teal-500/50 bg-teal-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-teal-800">🏷️ Digital Twin — מוכרים (Twin שני על אותה מסגרת)</h2>
          <p className="text-muted mt-1 text-[12px]">המוכר הוא ה-Twin השני על מסגרת ה-Digital Twin: מוטיבציה, אמון, פער מחיר, סיכון נטישה, מוכנות לחתימה, החלטות ומשימות — מראיות בלבד.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-teal-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "בונה Twins…" : "בנה Seller Twins"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="מוכרים" value={fmt(data.totals.sellers)} />
            <Mini label="חמים" value={fmt(data.totals.hot)} tone="green" />
            <Mini label="בסיכון" value={fmt(data.totals.atRisk)} tone="red" />
            <Mini label="פער מחיר" value={fmt(data.totals.priceGap)} tone="amber" />
            <Mini label="מוכן לחתימה" value={fmt(data.totals.readyToSign)} tone="green" />
            <Mini label="מתיישנים" value={fmt(data.totals.stale)} />
            <Mini label="ערך גבוה" value={fmt(data.totals.highValue)} tone="green" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {data.twins.slice(0, 6).map((t) => (
            <div key={t.identity.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{t.identity.name}{t.classification.length ? <span className="text-teal-700 font-bold"> · {t.classification.join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 font-bold">אמון בעסקה {t.profile.sellerConfidence}%</span>
                  <span className="text-muted">בריאות {t.health.score} · {t.health.label}</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                מוטיבציה {t.profile.motivation} · אמון {t.profile.trust} · מוכנות {t.profile.readinessToSign} · נטישה {t.profile.churnRisk} · חלון {t.profile.timeline}
                {t.profile.priceGapPct != null ? <span> · פער מחיר {t.profile.priceGapPct}%</span> : null}
                {t.truth ? <span> · אמת נתונים {t.truth.truthScore}</span> : null}
              </div>
              <div className="text-teal-800 mt-1 text-[11px] font-bold">← הפעולה הבאה: {t.profile.nextBestAction}</div>
              {t.decisions[0] && <div className="text-muted text-[11px]">החלטה: {t.decisions[0].action} ({t.decisions[0].priority}) · {t.decisions[0].evidence[0] ?? ""}</div>}
              {t.missions[0] && <div className="text-muted text-[11px]">משימות: {t.missions.slice(0, 3).map((m) => m.title).join(", ")}</div>}
              {t.learnings[0] && <div className="text-muted text-[11px]">למידה: {t.learnings[0].note}</div>}
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Seller Twin v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── Digital Twin Framework — Buyer Twins (28.1) ──────────────────────────────
function DigitalTwinPanel() {
  const [data, setData] = useState<BuyerTwinsOverview | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getBuyerTwinsAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-fuchsia-500/50 bg-fuchsia-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-fuchsia-800">👤 Digital Twin — קונים (הטמעה ראשונה של המסגרת)</h2>
          <p className="text-muted mt-1 text-[12px]">מסגרת Digital Twin אוניברסלית שכל ישות עתידית תשתמש בה. הקונה הוא ה-Twin הראשון: פרופיל, זיכרון, אמון, קשרים, החלטות, משימות, בריאות ולמידה — מראיות בלבד.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-fuchsia-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "בונה Twins…" : "בנה Digital Twins"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="קונים" value={fmt(data.totals.buyers)} />
            <Mini label="חמים" value={fmt(data.totals.hot)} tone="red" />
            <Mini label="יוקרה" value={fmt(data.totals.luxury)} />
            <Mini label="משקיעים" value={fmt(data.totals.investors)} />
            <Mini label="משפחות" value={fmt(data.totals.families)} tone="green" />
            <Mini label="רדומים" value={fmt(data.totals.dormant)} />
            <Mini label="ערך גבוה" value={fmt(data.totals.highValue)} tone="green" />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          <p className="text-muted text-[11px]"><b>המסגרת תומכת בישויות:</b> {data.frameworkEntities.join(" · ")}</p>

          {data.twins.slice(0, 6).map((t) => (
            <div key={t.identity.id} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-ink font-black">{t.identity.name}{t.classification.length ? <span className="text-fuchsia-700 font-bold"> · {t.classification.join(" · ")}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 font-bold">קנייה {t.profile.probabilityToBuy}%</span>
                  <span className="text-muted">בריאות {t.health.score} · {t.health.label}</span>
                </span>
              </div>
              <div className="text-muted mt-1 text-[11px]">
                מוכנות {t.profile.readiness} · דחיפות {t.profile.urgency} · אמון {t.profile.trust} · חלון {t.profile.timeline} · תקציב {t.profile.budget.max ? `עד ${(t.profile.budget.max).toLocaleString("he-IL")} ₪` : "לא ידוע"}
                {t.truth ? <span> · אמת נתונים {t.truth.truthScore}</span> : null}
              </div>
              {t.decisions[0] && <div className="text-fuchsia-800 mt-1 text-[11px] font-bold">← החלטה: {t.decisions[0].action} ({t.decisions[0].priority})</div>}
              {t.missions[0] && <div className="text-muted text-[11px]">משימה: {t.missions[0].title} · {t.missions.slice(0, 3).map((m) => m.missionType).join(", ")}</div>}
              {t.learnings[0] && <div className="text-muted text-[11px]">למידה: {t.learnings[0].note}</div>}
            </div>
          ))}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · Digital Twin v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── Relationship Intelligence & Universal Entity Graph (27.9) ────────────────
function RelationshipGraphPanel() {
  const [data, setData] = useState<RelationshipReport | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getRelationshipGraphAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };
  const band = (n: number): "green" | "amber" | "red" => (n >= 66 ? "green" : n >= 40 ? "amber" : "red");

  return (
    <section className="rounded-3xl border-2 border-sky-500/50 bg-sky-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-sky-800">🕸️ מודיעין קשרים — גרף ישויות אוניברסלי</h2>
          <p className="text-muted mt-1 text-[12px]">כל ישות יודעת כיצד היא קשורה לכל ישות אחרת. קשרים הם אזרחים מהמעלה הראשונה: עוצמה, ביטחון, ראיות, משך, טריות ואימות — מראיות אמיתיות בלבד.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-sky-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "בונה גרף…" : "בנה גרף קשרים"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="ישויות" value={fmt(data.graph.counts.nodes)} />
            <Mini label="קשרים" value={fmt(data.graph.counts.edges)} />
            <Mini label="חזקים" value={fmt(data.executive.totals.strong)} tone="green" />
            <Mini label="חלשים" value={fmt(data.executive.totals.weak)} tone="red" />
            <Mini label="מנותקים" value={fmt(data.executive.totals.disconnected)} />
            <Mini label="בריאות רשת" value={`${data.executive.networkHealth}`} tone={band(data.executive.networkHealth)} />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {/* Most connected + strongest */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BriefBlock title="🔗 המתווכים הכי מקושרים" items={data.network.mostConnectedBrokers.map((n) => `${n.name} — ${n.degree} קשרים`)} />
            <BriefBlock title="🏢 המשרדים הכי משפיעים" items={data.network.mostInfluentialOffices.map((n) => `${n.name} — משקל ${n.weightedDegree}`)} />
          </div>

          {/* Strategic relationships */}
          {data.executive.strategicRelationships.length > 0 && (
            <div>
              <b className="text-sky-800">⭐ קשרים אסטרטגיים (חזקים ומאומתים):</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.executive.strategicRelationships.slice(0, 6).map((e) => {
                  const fromName = data.graph.nodes.find((n) => n.id === e.from)?.name ?? e.from;
                  const toName = data.graph.nodes.find((n) => n.id === e.to)?.name ?? e.to;
                  return (
                    <div key={e.id} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5">
                      <span className="text-ink"><b>{fromName}</b> <span className="text-sky-700">{RELATION_HE[e.type] ?? e.type}</span> <b>{toName}</b></span>
                      <span className="text-muted text-[10px]">עוצמה {e.strength} · {e.occurrences}× · {e.verification}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hidden opportunities */}
          {data.network.hiddenOpportunities.length > 0 && (
            <BriefBlock title="💎 הזדמנויות נסתרות (קשרים חסרים)" items={data.network.hiddenOpportunities.map((h) => `${h.aName} ↔ ${h.bName}: ${h.suggestion} (${h.sharedNeighbors} משותפים)`)} tone="green" />
          )}

          {/* CoS + Decision */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <b className="text-sky-800">🗣️ ה-Chief of Staff מסיק מהקשרים:</b>
              <ul className="mt-1 flex flex-col gap-0.5">{data.chiefOfStaffAnswers.map((a, i) => <li key={i} className="text-muted text-[11px]">• {a.statement}</li>)}</ul>
            </div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <b className="text-sky-800">🎯 השפעת קשרים על החלטות:</b>
              {data.decisionInfluences.length ? (
                <ul className="mt-1 flex flex-col gap-0.5">{data.decisionInfluences.slice(0, 6).map((im, i) => <li key={i} className="text-muted text-[11px]">{im.direction === "increase" ? "⬆️" : im.direction === "decrease" ? "⬇️" : "▪️"} {im.note}</li>)}</ul>
              ) : <p className="text-muted mt-1 text-[11px]">אין עדיין השפעות — נדרשים קשרים.</p>}
            </div>
          </div>

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · גרף קשרים v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── Organizational Memory & Learning Brain (27.8) ────────────────────────────
function OrgMemoryPanel() {
  const [data, setData] = useState<OrgMemoryReport | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getOrgMemoryAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border-2 border-indigo-500/50 bg-indigo-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-indigo-800">🧠 זיכרון ארגוני ומוח לומד</h2>
          <p className="text-muted mt-1 text-[12px]">ZONO זוכר מה קרה, מה עבד, מה נכשל ומה חזר — מתוך היסטוריית משימות אמיתית. הזיכרון שייך לארגון, לא ל-AI. מבוסס-ראיות בלבד.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-indigo-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "נזכר…" : "טען זיכרון ארגוני"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="אירועים" value={fmt(data.totals.events)} />
            <Mini label="הצלחות" value={fmt(data.totals.successes)} tone="green" />
            <Mini label="כשלים" value={fmt(data.totals.failures)} tone="red" />
            <Mini label="לקחים" value={fmt(data.learnings.length)} />
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {/* Learnings */}
          {data.learnings.length > 0 && (
            <div>
              <b>📚 לקחים ארגוניים (מתבניות חוזרות):</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.learnings.slice(0, 6).map((l) => (
                  <div key={l.id} className="border-line bg-surface rounded-xl border px-3 py-2">
                    <div className="flex items-center justify-between"><span className="font-bold" style={{ color: l.kind === "success" ? "#15803d" : "#be123c" }}>{l.title}</span><span className="text-muted text-[10px]">×{l.occurrences} · ביטחון {l.confidence}%</span></div>
                    <div className="text-brand-strong mt-0.5 text-[11px] font-bold">← {l.recommendation}</div>
                    <div className="text-muted mt-0.5 text-[10px]">{l.why}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chief of Staff answers + decision improvements */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <b className="text-indigo-800">🗣️ ה-Chief of Staff נזכר:</b>
              <ul className="mt-1 flex flex-col gap-0.5">
                {data.chiefOfStaffAnswers.map((a, i) => <li key={i} className="text-muted text-[11px]"><b className="text-ink">{a.question}</b> {a.answer}</li>)}
              </ul>
            </div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <b className="text-indigo-800">🎯 שיפור החלטות מהיסטוריה:</b>
              {data.decisionImprovements.length ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {data.decisionImprovements.slice(0, 6).map((im, i) => <li key={i} className="text-muted text-[11px]">{im.direction === "boost" ? "⬆️" : "⚠️"} {im.note}</li>)}
                </ul>
              ) : <p className="text-muted mt-1 text-[11px]">אין עדיין שיפורים — נדרשת היסטוריה חוזרת.</p>}
            </div>
          </div>

          {/* Executive memory */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BriefBlock title="🏆 הצלחות מובילות" items={data.executiveMemory.topSuccesses.map((l) => `${l.title}`)} tone="green" />
            <BriefBlock title="💥 בעיות חוזרות" items={data.executiveMemory.recurringProblems.map((p) => `${p.note}`)} tone="red" />
          </div>

          {/* Timeline */}
          {data.timeline.length > 0 && (
            <div>
              <b>🕓 ציר זמן ארגוני:</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.timeline.slice(0, 8).map((e, i) => (
                  <div key={i} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5">
                    <span className="text-ink"><b style={{ color: e.outcome === "success" ? "#15803d" : e.outcome === "failure" ? "#be123c" : "#334155" }}>{e.outcomeText}</b> · {e.entity}</span>
                    <span className="text-muted text-[10px]">{e.at.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · זיכרון ארגוני v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── Truth Engine — data reliability framework (27.7) ─────────────────────────
function TruthEnginePanel() {
  const [data, setData] = useState<OrgTruthReport | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getTruthReportAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };
  const band = (n: number): "green" | "amber" | "red" => (n >= 66 ? "green" : n >= 40 ? "amber" : "red");

  return (
    <section className="rounded-3xl border-2 border-emerald-500/60 bg-emerald-50/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-emerald-800">🛡️ מנוע האמת — מסגרת מהימנות נתונים</h2>
          <p className="text-muted mt-1 text-[12px]">כל ישות מקבלת ציון אמון נמדד מראיות אמיתיות: איכות נתונים, טריות, אימות, סתירות ומידע חסר. לעולם לא מפוברק — הביטחון מוגבל לראיות בפועל.</p>
        </div>
        <button onClick={run} disabled={pending} className="rounded-xl bg-emerald-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מחשב אמון…" : "הפעל מנוע אמת"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          {/* Organization truth + data health */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="border-line bg-surface rounded-2xl border px-5 py-3">
              <div className="text-muted text-[11px] font-bold">ציון אמת ארגוני</div>
              <div className="text-3xl font-black tabular-nums text-emerald-800">{data.organization.truthScore}</div>
              <div className="text-muted text-[10px]">ביטחון {data.organization.confidence}% · {VERIFICATION_HE[data.organization.verificationLevel]} · {FRESHNESS_HE[data.organization.freshnessLevel]}</div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {(["organization", "office", "broker", "property", "market"] as const).map((k) => {
                const h = data.dataHealth[k];
                const label = { organization: "ארגון", office: "משרדים", broker: "מתווכים", property: "נכסים", market: "שוק" }[k];
                return <Mini key={k} label={label} value={`${h.score}`} tone={band(h.score)} />;
              })}
            </div>
          </div>

          {/* Executive integration — CoS consumes truth */}
          {data.executive && (
            <div className="rounded-xl border border-emerald-500/40 bg-surface px-3 py-2">
              <b className="text-emerald-800">🧠 השפעה על ה-Chief of Staff:</b>
              <span className="text-muted"> ביטחון AI {data.executive.cosAiConfidence} → מותאם-אמון <b className="text-emerald-800">{data.executive.truthAdjustedConfidence}</b>. {data.executive.note}</span>
            </div>
          )}

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {/* Data health detail */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {(["organization", "office", "broker", "property", "market"] as const).map((k) => {
              const h = data.dataHealth[k];
              const label = { organization: "ארגון", office: "משרדים", broker: "מתווכים", property: "נכסים", market: "שוק" }[k];
              return (
                <div key={k} className="border-line bg-surface rounded-lg border px-3 py-1.5">
                  <div className="flex items-center justify-between"><span className="text-ink font-bold">{label}</span><span className="tabular-nums font-black" style={{ color: h.score >= 66 ? "#15803d" : h.score >= 40 ? "#b45309" : "#be123c" }}>{h.score}</span></div>
                  <div className="text-muted mt-0.5 text-[10px] leading-tight">{h.entities} ישויות · מאומת {h.verifiedPct}% · סתירות {h.contradictionRatePct}% · מתיישנות {h.staleCount}</div>
                </div>
              );
            })}
          </div>

          {/* Top contradictions */}
          {data.topContradictions.length > 0 && (
            <div>
              <b className="text-rose-700">⚠️ סתירות מובילות (מנוע הסתירות):</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.topContradictions.slice(0, 6).map((c) => (
                  <div key={c.id} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5">
                    <span className="text-ink font-bold">{c.note}</span>
                    <span className="text-muted text-[11px]">{c.values.slice(0, 3).join(" ≠ ")} · {c.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lowest trust + stale */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BriefBlock title="🔻 אמון נמוך — דורש אימות" items={data.lowestTrust.map((t) => `${t.entityName ?? t.entityId} — אמת ${t.truthScore} · ${VERIFICATION_HE[t.verificationLevel]}`)} tone="red" />
            <BriefBlock title="⏳ ישויות מתיישנות" items={data.staleEntities.map((t) => `${t.entityName ?? t.entityId} — ${FRESHNESS_HE[t.freshnessLevel]} (טריות ${t.freshness})`)} />
          </div>

          {/* Explainability sample */}
          {data.sampleOffices[0] && (
            <div className="rounded-xl border border-emerald-500/30 bg-surface px-3 py-2 text-[11px]">
              <b>🔍 הסבר אמון (דוגמה — {data.sampleOffices[0].entityName}):</b>
              <p className="text-muted mt-1">{data.sampleOffices[0].explanation.why}</p>
              <p className="text-muted">טריות: {data.sampleOffices[0].explanation.freshness} · חסר: {data.sampleOffices[0].explanation.missingData.join(", ")} · סתירות: {data.sampleOffices[0].explanation.contradictions.join(", ")}</p>
            </div>
          )}

          <p className="text-muted text-[10px]">נוצר {new Date(data.generatedAt).toLocaleString("he-IL")} · מנוע אמת v{data.version}</p>
        </div>
      )}
    </section>
  );
}

// ── AI Chief of Staff — CEO dashboard (orchestration over every engine, 27.6) ─
function ChiefOfStaffPanel() {
  const [data, setData] = useState<ChiefOfStaffReport | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getChiefOfStaffAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };
  const band = (n: number): "green" | "amber" | "red" => (n >= 66 ? "green" : n >= 40 ? "amber" : "red");

  return (
    <section className="border-brand rounded-3xl border-2 bg-gradient-to-l from-brand-soft/40 to-transparent p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-brand-strong text-xl font-black">🧠 ה-Chief of Staff של ZONO — דשבורד מנכ״ל</h2>
          <p className="text-muted mt-1 text-[12px]">שכבת התזמור מעל כל מנועי ZONO: מסתכל, מתעדף, מחבר וממליץ — לעולם לא מקור אמת ולא מבצע אוטומטית. מבוסס-ראיות בלבד.</p>
        </div>
        <button onClick={run} disabled={pending} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח…" : "הפעל Chief of Staff"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-4 text-[12px]">
          {/* Organization Score + AI confidence */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="border-brand/40 bg-surface rounded-2xl border px-5 py-3">
              <div className="text-muted text-[11px] font-bold">ציון ארגוני כולל</div>
              <div className="text-brand-strong text-3xl font-black tabular-nums">{data.organizationScore.overall}</div>
              <div className="text-muted text-[10px]">ביטחון AI {data.dashboard.aiConfidence}%</div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {data.dashboard.health.map((h) => <Mini key={h.key} label={h.label} value={`${h.score}`} tone={band(h.score)} />)}
            </div>
          </div>

          {/* Organization Score dimensions */}
          <div>
            <b>ציון הארגון — 8 ממדים:</b>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {data.organizationScore.dims.map((d) => (
                <div key={d.key} className="border-line bg-surface rounded-lg border px-3 py-1.5">
                  <div className="flex items-center justify-between"><span className="text-ink font-bold">{d.label}</span><span className="tabular-nums font-black" style={{ color: d.score >= 66 ? "#15803d" : d.score >= 40 ? "#b45309" : "#be123c" }}>{d.score}</span></div>
                  <div className="text-muted mt-0.5 text-[10px] leading-tight">{d.basis}</div>
                </div>
              ))}
            </div>
          </div>

          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}

          {/* Executive briefing */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BriefBlock title="🎯 עדיפויות היום" items={data.briefing.todaysPriorities.map((r) => `${r.title} · ${r.affectedEntities[0] ?? ""}`)} />
            <BriefBlock title="⚠️ סיכונים קריטיים" items={data.briefing.criticalRisks.map((r) => `${r.title} — ${r.evidence[0] ?? ""}`)} tone="red" />
            <BriefBlock title="💡 הזדמנויות" items={data.briefing.importantOpportunities.map((r) => `${r.title} · ${r.affectedEntities[0] ?? ""}`)} tone="green" />
            <BriefBlock title="🚀 משימות דחופות" items={data.briefing.urgentMissions.map((r) => `${r.title} (${r.urgency})`)} />
          </div>

          {/* Cross-module reasoning */}
          {data.crossModuleInsights.length > 0 && (
            <div>
              <b>🔗 חשיבה חוצת-מודולים:</b>
              <div className="mt-1 flex flex-col gap-2">
                {data.crossModuleInsights.map((ins) => (
                  <div key={ins.id} className="border-brand/30 bg-surface rounded-xl border px-3 py-2">
                    <div className="flex items-center justify-between"><span className="text-ink font-bold">{ins.title}</span><span className="text-muted text-[10px]">{ins.modules.join(" → ")} · ביטחון {ins.confidence}%</span></div>
                    <div className="text-muted mt-1 text-[11px]">{ins.chain.join("  ↓  ")}</div>
                    <div className="text-brand-strong mt-1 text-[11px] font-bold">← {ins.recommendation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution coordinator interventions */}
          {data.interventions.length > 0 && (
            <div className="text-[11px]">
              <b>🛠️ רכז ביצוע — התערבויות מומלצות (לא מבוצע אוטומטית):</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.interventions.slice(0, 6).map((i) => (
                  <div key={i.id} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5">
                    <span className="text-ink font-bold">{i.title}</span>
                    <span className="text-muted">{i.affectedEntities[0] ?? ""} · דחיפות {i.urgency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alerts + business memory */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BriefBlock title="📣 התראות תחרות/שוק" items={[...data.briefing.competitiveAlerts, ...data.briefing.marketAlerts].slice(0, 6)} />
            <div className="border-line bg-surface rounded-xl border px-3 py-2 text-[11px]">
              <b>🧠 זיכרון ארגוני:</b>
              <p className="text-muted mt-1">{data.businessMemory.summary}</p>
              {data.businessMemory.successfulStrategies.length > 0 && <p className="mt-1 text-green-700"><b>אסטרטגיות מוצלחות:</b> {data.businessMemory.successfulStrategies.map((s) => `${s.key} (${s.count})`).join(" · ")}</p>}
              {data.businessMemory.repeatedProblems.length > 0 && <p className="mt-1 text-rose-700"><b>בעיות חוזרות:</b> {data.businessMemory.repeatedProblems.map((p) => `${p.key} (${p.count})`).join(" · ")}</p>}
            </div>
          </div>

          <p className="text-muted text-[10px]">מקורות שנטענו: {data.globalContext.sources.join(" · ")} · נוצר {new Date(data.generatedAt).toLocaleString("he-IL")}</p>
        </div>
      )}
    </section>
  );
}

function BriefBlock({ title, items, tone }: { title: string; items: string[]; tone?: "red" | "green" }) {
  if (!items.length) return null;
  const color = tone === "red" ? "text-rose-700" : tone === "green" ? "text-green-700" : "text-ink";
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2">
      <b className={color}>{title}</b>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.slice(0, 6).map((t, i) => <li key={i} className="text-muted text-[11px]">• {t}</li>)}
      </ul>
    </div>
  );
}

function ActionCenterPanel() {
  const [data, setData] = useState<ActionCenter | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getActionCenterAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="border-brand/50 bg-brand-soft/20 rounded-3xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-brand-strong text-lg font-black">🚀 מרכז פעולות — משימות ביצוע</h2>
          <p className="text-muted mt-1 text-[12px]">מנוע המשימות האוניברסלי: החלטות הופכות למשימות ומשימות למשימות-משנה. שום דבר לא רץ אוטומטית.</p>
        </div>
        <button onClick={run} disabled={pending} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "טוען…" : "טען מרכז פעולות"}</button>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="פעילות" value={fmt(data.totals.active)} tone="amber" />
            <Mini label="בביצוע" value={fmt(data.totals.inProgress)} tone="green" />
            <Mini label="ממתינות" value={fmt(data.totals.waiting)} />
            <Mini label="חסומות" value={fmt(data.totals.blocked)} tone="red" />
            <Mini label="הושלמו" value={fmt(data.totals.completed)} tone="green" />
            <Mini label="ציון ביצוע" value={`${data.executionScore}`} />
            <Mini label="שיעור השלמה" value={`${data.completionRatePct}%`} />
          </div>
          {data.notes.length > 0 && <p className="font-semibold text-amber-700">{data.notes.join(" · ")}</p>}
          {data.critical.length + data.highPriority.length > 0 && (
            <div>
              <b>משימות קריטיות / עדיפות גבוהה:</b>
              <div className="mt-1 flex flex-col gap-1">
                {[...data.critical, ...data.highPriority].slice(0, 8).map((m) => (
                  <div key={m.id} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-1.5">
                    <span className="text-ink font-bold">{m.goal || m.missionType}{m.entityName ? <span className="text-muted font-normal"> · {m.entityName}</span> : ""}</span>
                    <span className="flex items-center gap-2 text-[11px]"><span className="bg-brand-soft/60 rounded-full px-2 py-0.5 font-bold tabular-nums">{m.priority}</span><span className="text-muted">{EXEC_STATUS_HE[m.status]}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.todaysTasks.length > 0 && <div className="text-muted text-[11px]"><b>משימות להיום:</b> {data.todaysTasks.slice(0, 8).map((t) => t.task.title).join(" · ")}</div>}
          {(data.blocked.length > 0 || data.waiting.length > 0) && <div className="text-muted text-[11px]"><b>חסומות/ממתינות:</b> {[...data.blocked, ...data.waiting].slice(0, 6).map((m) => `${m.goal || m.missionType} (${EXEC_STATUS_HE[m.status]})`).join(" · ")}</div>}
        </div>
      )}
    </section>
  );
}

// ── Command Center — Daily AI Briefing (Decision Engine, 27.4) ───────────────
function CommandCenterPanel({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [data, setData] = useState<DailyBriefing | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getCityDecisionBriefingAction(city); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="border-brand/50 bg-brand-soft/30 rounded-3xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-brand-strong text-lg font-black">🧭 מרכז פיקוד — תדריך AI יומי</h2>
          <p className="text-muted mt-1 text-[12px]">מנוע ההחלטות המרכזי: עדיפויות, סיכונים, הזדמנויות והתראות — מבוסס-ראיות בלבד, לא ספקולטיבי.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} list="cc-city-list" placeholder="עיר" className="border-line bg-surface text-ink min-w-[160px] rounded-full border px-3 py-1.5 text-sm" />
          <datalist id="cc-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={run} disabled={pending || !city.trim()} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "בונה תדריך…" : "בנה תדריך יומי"}</button>
        </div>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface px-3 py-1 font-bold">ציון עסקי {data.businessScore}</span>
            <span className="text-muted">ביטחון AI {data.aiConfidence}%</span>
          </div>
          {/* Top priorities */}
          {data.todaysPriorities.length > 0 && (
            <div>
              <b>עדיפויות היום:</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.todaysPriorities.map((d) => (
                  <div key={d.id} className="border-line bg-surface rounded-lg border px-3 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink font-bold">{d.title}</span>
                      <span className="flex items-center gap-2 text-[11px]"><span className="bg-brand-soft/60 rounded-full px-2 py-0.5 font-bold tabular-nums">עדיפות {d.priorityScore}</span><span className="text-muted">{EXECUTION_HE[d.executionReadiness]}</span></span>
                    </div>
                    <div className="text-emerald-700 mt-0.5 text-[10px]">מדוע: {d.evidence.join(" · ")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {data.topRisks.length > 0 && <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-2"><b className="text-rose-700">סיכונים מובילים</b><ul className="text-muted mt-1 flex flex-col gap-0.5 text-[11px]">{data.topRisks.map((r) => <li key={r.id} title={r.evidence}>• {r.title} ({r.severity})</li>)}</ul></div>}
            {data.topOpportunities.length > 0 && <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2"><b className="text-emerald-700">הזדמנויות מובילות</b><ul className="text-muted mt-1 flex flex-col gap-0.5 text-[11px]">{data.topOpportunities.map((o) => <li key={o.id} title={o.evidence}>• {o.title}</li>)}</ul></div>}
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
            <div className="border-line bg-surface rounded-xl border px-3 py-2"><b>התראות מתחרים</b><ul className="text-muted mt-1">{data.competitorAlerts.length ? data.competitorAlerts.map((a, i) => <li key={i}>• {a}</li>) : <li>—</li>}</ul></div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2"><b>התראות מתווכים</b><ul className="text-muted mt-1">{data.brokerAlerts.length ? data.brokerAlerts.map((a, i) => <li key={i}>• {a}</li>) : <li>—</li>}</ul></div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2"><b>התראות שוק</b><ul className="text-muted mt-1">{data.marketAlerts.map((a, i) => <li key={i}>• {a}</li>)}</ul></div>
          </div>
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((nt, i) => <li key={i}>{nt}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

// ── Competitive Intelligence — city market dashboard ─────────────────────────
const CONC_HE: Record<string, string> = { fragmented: "מפוצל", moderate: "בינוני", concentrated: "מרוכז" };
function CompetitiveDashboardPanel({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [data, setData] = useState<CityCompetitiveDashboard | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getCityCompetitiveDashboardAction(city); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border border-indigo-200 bg-indigo-50/20 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-indigo-900 text-lg font-black">⚔️ מודיעין תחרותי — לוח שוק עירוני</h2>
          <p className="text-muted mt-1 text-[12px]">כל משרד מול כל מתחרה: דירוג, נתח, צמיחה/ירידה, ריכוזיות שוק ותובנות — מבוסס-ראיות בלבד.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} list="comp-city-list" placeholder="עיר" className="border-line bg-surface text-ink min-w-[160px] rounded-full border px-3 py-1.5 text-sm" />
          <datalist id="comp-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={run} disabled={pending || !city.trim()} className="bg-indigo-600 rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח…" : "נתח תחרות"}</button>
        </div>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="משרדים פעילים" value={fmt(data.snapshot.activeOffices)} />
            <Mini label="מאומתים" value={fmt(data.snapshot.verifiedOffices)} tone="green" />
            <Mini label="מתווכים פעילים" value={fmt(data.snapshot.activeBrokers)} />
            <Mini label="מודעות פעילות" value={fmt(data.snapshot.activeListings)} tone="green" />
            <Mini label="מגמת מלאי" value={`${data.snapshot.inventoryTrendPct > 0 ? "+" : ""}${data.snapshot.inventoryTrendPct}%`} tone={data.snapshot.inventoryTrendPct >= 0 ? "green" : "red"} />
            <Mini label="ריכוזיות" value={CONC_HE[data.snapshot.concentrationLevel]} />
            <Mini label="נתח מוביל" value={`${data.snapshot.topOfficeSharePct}%`} />
          </div>
          {data.insights.length > 0 && <ul className="flex flex-col gap-0.5">{data.insights.slice(0, 6).map((ins, i) => <li key={i} className="text-ink" title={ins.evidence}>• {ins.text}</li>)}</ul>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-muted mb-1 text-[11px] font-bold">משרדים מובילים (נתח מלאי)</div>
              <div className="flex flex-col gap-1">
                {data.topOffices.slice(0, 8).map((o) => (
                  <Link key={o.officeId} href={`/brokerage-data/office/${o.officeId}`} className="border-line bg-surface hover:border-brand/40 flex items-center justify-between rounded-lg border px-3 py-1.5 text-[12px] transition-colors">
                    <span className="text-ink font-bold">#{o.rank} {o.officeName}{o.brand ? <span className="text-muted font-normal"> · {o.brand}</span> : ""}</span>
                    <span className="text-muted text-[11px] tabular-nums">{o.listingSharePct}% · {fmt(o.activeListings)} · {fmt(o.neighborhoods.length)} שכונות</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="grid grid-rows-2 gap-2">
              <div>
                <div className="text-muted mb-1 text-[11px] font-bold">צומחים מהר</div>
                <div className="flex flex-wrap gap-1">{data.topGrowing.length ? data.topGrowing.slice(0, 6).map((o) => <span key={o.officeId} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{o.officeName} +{o.growthPct}%</span>) : <span className="text-muted text-[11px]">—</span>}</div>
              </div>
              <div>
                <div className="text-muted mb-1 text-[11px] font-bold">בירידה</div>
                <div className="flex flex-wrap gap-1">{data.topDeclining.length ? data.topDeclining.slice(0, 6).map((o) => <span key={o.officeId} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">{o.officeName} {o.growthPct}%</span>) : <span className="text-muted text-[11px]">—</span>}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
            <div className="border-line bg-surface rounded-xl border px-3 py-2"><b>שליטת יוקרה</b><div className="text-muted mt-1">{data.highestLuxuryShare.slice(0, 4).map((c) => `${c.officeName} ${c.note}`).join(" · ") || "—"}</div></div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2"><b>שליטה מסחרית</b><div className="text-muted mt-1">{data.highestCommercialShare.slice(0, 4).map((c) => `${c.officeName} ${c.note}`).join(" · ") || "—"}</div></div>
            <div className="border-line bg-surface rounded-xl border px-3 py-2"><b>אזורים מתפתחים</b><div className="text-muted mt-1">{data.emergingAreas.slice(0, 4).map((o) => o.area ?? o.title).join(" · ") || "—"}</div></div>
          </div>
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((nt, i) => <li key={i}>{nt}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

// ── Territory Intelligence — who dominates every neighborhood/street ─────────
const nis = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
function TerritoryIntelligencePanel({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [data, setData] = useState<CityTerritoryIntelligence | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getCityTerritoryIntelligenceAction(city); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };
  const heatColor = (v: number) => v >= 66 ? "bg-emerald-500/70" : v >= 40 ? "bg-emerald-400/50" : v >= 20 ? "bg-amber-300/50" : v > 0 ? "bg-amber-200/40" : "bg-line/40";

  return (
    <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">🗺️ מודיעין טריטוריה — מי שולט בכל שכונה ורחוב</h2>
          <p className="text-muted mt-1 text-[12px]">נתח שוק, דומיננטיות ותובנות — מבוסס-ראיות בלבד (מודעות מקושרות למשרדים/מתווכים). ללא שינוי בהערכת שווי/גילוי.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} list="terr-city-list" placeholder="עיר" className="border-line bg-surface text-ink min-w-[160px] rounded-full border px-3 py-1.5 text-sm" />
          <datalist id="terr-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={run} disabled={pending || !city.trim()} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח…" : "נתח טריטוריה"}</button>
        </div>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="מודעות" value={fmt(data.totals.listings)} />
            <Mini label="פעילות" value={fmt(data.cityStats.activeListings)} tone="green" />
            <Mini label="משרדים" value={fmt(data.totals.offices)} />
            <Mini label="מתווכים" value={fmt(data.totals.brokers)} />
            <Mini label="חציון מחיר" value={nis(data.cityStats.medianPrice)} />
            <Mini label="יוקרה %" value={`${data.cityStats.luxuryPct}%`} />
            <Mini label="שכונות" value={fmt(data.totals.neighborhoods)} />
          </div>
          {data.insights.length > 0 && <ul className="flex flex-col gap-0.5">{data.insights.map((ins, i) => <li key={i} className="text-ink">• {ins}</li>)}</ul>}

          {/* Neighborhood leaders */}
          {data.neighborhoods.length > 0 && (
            <div className="overflow-x-auto">
              <b>מובילי שכונות:</b>
              <table className="mt-1 w-full text-[11px]">
                <thead className="text-muted"><tr><th className="text-right">שכונה</th><th>פעילות</th><th>מוביל</th><th>נתח</th><th>דירוג</th><th>חציון</th><th>יוקרה</th></tr></thead>
                <tbody>
                  {data.neighborhoods.slice(0, 15).map((n) => { const d = n.officeDominance[0]; return (
                    <tr key={n.key} className="border-line border-b">
                      <td className="py-1 font-bold">{n.name}</td>
                      <td className="text-center tabular-nums">{fmt(n.stats.activeListings)}</td>
                      <td className="text-center">{n.leaderOffice?.name ?? "—"}</td>
                      <td className="text-center tabular-nums">{n.leaderOffice?.sharePct ?? 0}%</td>
                      <td className="text-center">{d ? DOMINANCE_BAND_HE[d.band] : "—"}</td>
                      <td className="text-center tabular-nums">{nis(n.stats.medianPrice)}</td>
                      <td className="text-center tabular-nums">{n.stats.luxuryPct}%</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}

          {/* Heatmap (office dominance / supply / luxury) */}
          {data.heatmap.length > 0 && (
            <div>
              <b>מפת חום (דומיננטיות · היצע · יוקרה):</b>
              <div className="mt-1 flex flex-col gap-1">
                {data.heatmap.slice(0, 14).map((h) => (
                  <div key={h.key} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-[11px] font-bold">{h.name}</span>
                    <span className={cn("h-4 rounded", heatColor(h.officeDominance))} style={{ width: `${Math.max(4, h.officeDominance)}%` }} title={`דומיננטיות ${h.officeDominance}`} />
                    <span className={cn("h-4 rounded", heatColor(h.supply))} style={{ width: `${Math.max(4, h.supply)}%` }} title={`היצע ${h.supply}`} />
                    <span className={cn("h-4 rounded", heatColor(h.luxury))} style={{ width: `${Math.max(4, h.luxury)}%` }} title={`יוקרה ${h.luxury}`} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((nt, i) => <li key={i}>{nt}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

// ── Brand & Branch Identity — Brand → Branch → Broker hierarchy (read-only) ──
function BrandHierarchyPanel({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("");
  const [data, setData] = useState<BrandHierarchy | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getBrandHierarchyAction(city.trim() || undefined); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };

  return (
    <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">🏷️ מותג ← סניף ← מתווך</h2>
          <p className="text-muted mt-1 text-[12px]">היררכיית תיווך אמיתית. סניפים של אותו מותג (RE/MAX Smart, Vision…) הם משרדים נפרדים — לעולם לא ממוזגים. כפילות מסומנת רק לפי מזהים חזקים (טלפון/אתר/כתובת/קואורדינטות).</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} list="brand-city-list" placeholder="עיר (ריק = הכל)" className="border-line bg-surface text-ink min-w-[160px] rounded-full border px-3 py-1.5 text-sm" />
          <datalist id="brand-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={run} disabled={pending} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "טוען…" : "בנה היררכיה"}</button>
        </div>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Mini label="מותגים" value={fmt(data.totals.brands)} />
            <Mini label="סניפים" value={fmt(data.totals.branches)} tone="green" />
            <Mini label="עצמאיים" value={fmt(data.totals.independents)} />
            <Mini label="מתווכים" value={fmt(data.totals.brokers)} />
            <Mini label="כפילות אפשרית" value={fmt(data.totals.possibleDuplicates)} tone={data.totals.possibleDuplicates ? "amber" : undefined} />
          </div>

          {data.brands.map((brand) => (
            <div key={brand.normalizedBrand} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="text-ink font-black">🏢 {brand.brand} <span className="text-muted font-normal">· {fmt(brand.branchCount)} סניפים · {fmt(brand.brokerCount)} מתווכים</span></div>
              <div className="mt-1 flex flex-col gap-1">
                {brand.branches.map((b) => (
                  <div key={b.officeId} className="border-line ms-3 border-s ps-3">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-ink font-bold">├── {b.branch ?? "(סניף ראשי)"} <span className="text-muted font-normal">· {b.displayName}</span></span>
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className={cn("rounded-full px-2 py-0.5 font-bold", b.verificationState === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{b.verificationState}</span>
                        <span className="text-muted tabular-nums">{fmt(b.brokerCount)} מתווכים · {Math.round(b.confidence)}%</span>
                      </span>
                    </div>
                    <div className="text-muted mt-0.5 text-[10px]">{b.explain.whySeparate} · {b.explain.whyNotMerged}</div>
                    {b.brokers.length > 0 && <div className="text-muted mt-0.5 text-[10px]">└─ {b.brokers.slice(0, 8).map((br) => br.name).join(" · ")}{b.brokers.length > 8 ? ` +${b.brokers.length - 8}` : ""}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {data.independentOffices.length > 0 && (
            <div className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="text-ink font-black">🏠 משרדים עצמאיים <span className="text-muted font-normal">· {fmt(data.independentOffices.length)}</span></div>
              <div className="mt-1 flex flex-col gap-0.5">
                {data.independentOffices.slice(0, 30).map((b) => (
                  <div key={b.officeId} className="flex items-center justify-between text-[11px]"><span className="text-ink font-bold">• {b.displayName}</span><span className="text-muted">{fmt(b.brokerCount)} מתווכים · {b.city ?? ""}</span></div>
                ))}
              </div>
            </div>
          )}

          {data.possibleDuplicates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2 text-amber-800">
              <b>כפילות אפשרית (לבדיקה ידנית בלבד — לא ממוזג):</b>
              <ul className="mt-1 list-disc pr-5">
                {data.possibleDuplicates.slice(0, 12).map((d, i) => <li key={i}>{d.officeAName} ↔ {d.officeBName} — {d.sharedSignals.join(", ")}</li>)}
              </ul>
            </div>
          )}
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((nt, i) => <li key={i}>{nt}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

// ── Promotion Debug™ — explain exactly why candidates (don't) become offices ──
const PROMO_STATUS_HE: Record<PromotionStatus, string> = { READY: "מוכן לקידום", BLOCKED: "חסום", WAITING: "ממתין", REJECTED: "נדחה" };
const PROMO_STATUS_TONE: Record<PromotionStatus, string> = { READY: "bg-emerald-50 text-emerald-700", BLOCKED: "bg-rose-50 text-rose-700", WAITING: "bg-amber-50 text-amber-700", REJECTED: "bg-slate-100 text-slate-600" };

function PromotionDebugPanel({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [data, setData] = useState<PromotionDebugDashboard | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 26.4.18 — Office Intelligence enrichment.
  const [enriching, setEnriching] = useState<string | null>(null);   // candidateId | "ALL" | null
  const [cityEnrich, setCityEnrich] = useState<CityEnrichmentResult | null>(null);
  const run = async () => { setPending(true); setErr(null); try { const r = await getPromotionDebugAction(city); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); } };
  const enrichOne = async (candidateId: string) => { setEnriching(candidateId); try { await buildOfficeIntelligenceForCandidateAction(candidateId); await run(); } finally { setEnriching(null); } };
  const enrichAll = async () => { setEnriching("ALL"); setCityEnrich(null); try { const r = await buildOfficeIntelligenceForCityAction(city); if (r.ok) setCityEnrich(r.result ?? null); await run(); } finally { setEnriching(null); } };

  return (
    <section className="rounded-3xl border border-indigo-200 bg-indigo-50/20 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-indigo-900 text-lg font-black">🔬 Promotion Debug™ — למה מועמד הופך (או לא) למשרד</h2>
          <p className="text-muted mt-1 text-[12px]">שקיפות מלאה: לכל מועמד — צ׳קליסט, ציון קידום, כללים שנכשלו, סיבות חסימה, סימולציה וצינור הקידום. קריאה בלבד; ללא שינוי בכללי האימות.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} list="promo-city-list" placeholder="עיר" className="border-line bg-surface text-ink min-w-[180px] rounded-full border px-3 py-1.5 text-sm" />
          <datalist id="promo-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={run} disabled={pending || enriching != null || !city.trim()} className="bg-indigo-600 rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח…" : "נתח קידום"}</button>
          <button onClick={enrichAll} disabled={enriching != null || !city.trim()} className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-1.5 text-sm font-bold text-indigo-800 disabled:opacity-60">{enriching === "ALL" ? "בונה…" : "🏢 בנה פרופילים לכל המועמדים"}</button>
        </div>
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {cityEnrich && (
        <div className="mt-2 rounded-xl border border-indigo-200 bg-surface px-3 py-2 text-[12px]">
          <b>העשרה בעיר:</b> עובדו {fmt(cityEnrich.processed)}/{fmt(cityEnrich.totalCandidates)} · אומתו {fmt(cityEnrich.verified)} · נותרו במחקר {fmt(cityEnrich.researching)} · נותרו {fmt(cityEnrich.remaining)}{cityEnrich.timedOut ? " · נעצר עקב תקציב — ניתן להריץ שוב" : ""}
          {!cityEnrich.searchConfigured && <div className="text-amber-700">אין ספק חיפוש ציבורי — לא בוצעה העשרה.</div>}
        </div>
      )}

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Mini label="מועמדים" value={fmt(data.totals.candidates)} />
            <Mini label="מוכנים" value={fmt(data.totals.ready)} tone="green" />
            <Mini label="חסומים" value={fmt(data.totals.blocked)} tone="red" />
            <Mini label="ממתינים" value={fmt(data.totals.waiting)} tone="amber" />
            <Mini label="נדחו" value={fmt(data.totals.rejected)} />
            <Mini label="מאומתים" value={fmt(data.totals.verified)} tone="green" />
            <Mini label="ציון קידום ממוצע" value={`${data.averagePromotionScore}`} />
          </div>
          {data.mostCommonBlockingReason && <div className="text-muted"><b>סיבת החסימה השכיחה:</b> {data.mostCommonBlockingReason}{data.blockingReasonBreakdown.length ? ` · פירוט: ${data.blockingReasonBreakdown.slice(0, 4).map((b) => `${b.reason} (${fmt(b.count)})`).join(" · ")}` : ""}</div>}

          {data.candidates.slice(0, 30).map((c) => (
            <div key={c.candidateId} className="border-line bg-surface rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink font-bold">{c.officeName}{c.brandNetwork ? <span className="text-muted font-normal"> · {c.brandNetwork}</span> : ""}</span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", PROMO_STATUS_TONE[c.status])}>{PROMO_STATUS_HE[c.status]}</span>
                  <span className="bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-bold tabular-nums">ציון {c.promotionScore.total}/100</span>
                  {c.profileCompleteness != null && <span className="bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 font-bold tabular-nums" title="שלמות פרופיל">פרופיל {c.profileCompleteness}%</span>}
                  <span className="text-muted tabular-nums">ביטחון {c.systemConfidence}%</span>
                  {c.status !== "REJECTED" && <button onClick={() => enrichOne(c.candidateId)} disabled={enriching != null} className="rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 font-bold text-indigo-800 disabled:opacity-60">{enriching === c.candidateId ? "בונה…" : "בנה פרופיל"}</button>}
                </span>
              </div>
              {/* Pipeline (Part 7) — highlight where it stopped */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                {PIPELINE_STAGES.map((st) => {
                  const stg = c.pipeline.stages.find((x) => x.stage === st)!;
                  const stopped = c.pipeline.stoppedAt === st;
                  return <span key={st} className={cn("rounded px-1.5 py-0.5 font-bold", stg.done ? "bg-emerald-100 text-emerald-700" : stopped ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500")}>{stg.done ? "✓" : stopped ? "⛔" : "·"} {PIPELINE_STAGE_HE[st]}</span>;
                })}
              </div>
              {/* Checklist */}
              <div className="text-muted mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
                {c.checklist.map((ci) => <span key={ci.key} className={ci.state === "pass" ? "text-emerald-700" : ci.state === "fail" ? "text-rose-600" : "text-slate-400"}>{ci.state === "pass" ? "✓" : ci.state === "fail" ? "✗" : "•"} {ci.label}</span>)}
              </div>
              {/* Promotion score breakdown */}
              <div className="text-muted mt-1 text-[10px]"><b>ניקוד:</b> {c.promotionScore.items.map((it) => `${it.label} ${it.got}/${it.max}`).join(" · ")}</div>
              {/* Failed rules (Part 3) */}
              {c.failedRules.length > 0 && <div className="mt-1 text-[11px] text-rose-700">{c.failedRules.map((r, i) => <div key={i}>❌ {r.title}: {r.reason}{r.detail ? ` — ${r.detail}` : ""}</div>)}</div>}
              {/* Top reasons (Part 5) */}
              {c.topReasons.length > 0 && <div className="mt-1 text-[11px] text-amber-700"><b>למה עדיין לא אומת:</b> {c.topReasons.join(" · ")}</div>}
              {/* Simulation (Part 6) */}
              {c.simulations.length > 0 && <div className="text-muted mt-1 text-[11px]"><b>סימולציה:</b> {c.simulations.map((sm) => `${sm.hypothesis} → ${sm.wouldVerify ? "היה מאומת" : "עדיין לא"}`).join(" · ")}</div>}
              {/* Office creation outcome (Part 8) */}
              <div className="text-muted mt-1 text-[11px] italic">יצירת משרד: {c.officeCreation.outcome} — {c.officeCreation.explanation}{c.lastEnrichedAt ? ` · הועשר: ${new Date(c.lastEnrichedAt).toLocaleDateString("he-IL")}` : ""}</div>
            </div>
          ))}
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((nt, i) => <li key={i}>{nt}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

function PipelineAuditPanel() {
  const [data, setData] = useState<BrokeragePipelineAudit | null>(null);
  const [pending, setPending] = useState(false);
  const run = async () => { setPending(true); try { setData(await auditBrokerageDiscoveryPipelineAction()); } finally { setPending(false); } };

  return (
    <section className="border-line bg-card rounded-3xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-ink text-lg font-black">🧪 Pipeline Audit™ (פורנזי · קריאה בלבד)</h2>
          <p className="text-muted mt-1 text-[12px]">מודד כל שלב בצינור הגילוי ומצליב מאגרים — לאיתור היכן נאבדים הנתונים.</p></div>
        <button onClick={run} disabled={pending} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מנתח…" : "הרץ אבחון צינור"}</button>
      </div>
      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-bold text-rose-800">פסק דין: {VERDICT_HE[data.verdict]} · החוליה החלשה: {data.weakestStage}</div>
          {/* Stage trace */}
          <div className="flex flex-col gap-1.5">
            {data.stages.map((st) => (
              <div key={st.name} className="flex items-center gap-2">
                <span className="text-ink w-44 shrink-0 font-bold">{st.name}</span>
                <div className="bg-surface h-3 flex-1 overflow-hidden rounded-full">
                  <div className={`h-full rounded-full ${st.healthPct < 20 ? "bg-rose-500" : st.healthPct < 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${st.healthPct}%` }} />
                </div>
                <span className="text-muted w-32 shrink-0 text-left tabular-nums">{fmt(st.output)} ({st.healthPct}%)</span>
              </div>
            ))}
          </div>
          {/* Repository cross-check */}
          <div><b>הצלבת מאגרים:</b>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.repositories.map((r) => (
                <span key={r.table} className={cn("rounded-full px-2 py-0.5 font-bold", r.error ? "bg-rose-50 text-rose-700" : "bg-surface text-muted")} title={r.error ?? r.table}>
                  {r.table}: {r.error ? "שגיאה" : fmt(r.rows ?? 0)}
                </span>
              ))}
            </div>
          </div>
          {/* Link breakdown */}
          <div><b>מתווכים משויכים לפי משרד ({fmt(data.linkedBrokersInOfficeCount)} משרדים, {fmt(data.totals.linkedBrokers)} מתווכים):</b>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.linkByOffice.slice(0, 15).map((o) => (
                <span key={o.officeId} className={cn("rounded-full px-2 py-0.5 font-bold", o.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{o.office}: {fmt(o.brokers)}{o.status !== "active" ? ` (${o.status})` : ""}</span>
              ))}
            </div>
          </div>
          {/* Normalization duplicates */}
          {data.cityNormalizationDuplicates.length > 0 && (
            <div><b>איותי עיר כפולים (לא ממוזגים):</b>
              <ul className="text-muted mt-1 list-disc pr-5">{data.cityNormalizationDuplicates.slice(0, 8).map((d) => <li key={d.normalized}>{d.spellings.join(" / ")} ({fmt(d.rows)} שורות)</li>)}</ul>
            </div>
          )}
          {data.officeNameDuplicates.length > 0 && (
            <div><b>איותי שם-משרד כפולים:</b>
              <ul className="text-muted mt-1 list-disc pr-5">{data.officeNameDuplicates.slice(0, 6).map((d) => <li key={d.normalized}>{d.spellings.join(" / ")}</li>)}</ul>
            </div>
          )}
          {/* City coverage */}
          <div className="overflow-x-auto">
            <b>כיסוי לפי עיר:</b>
            <table className="mt-1 w-full text-[11px]">
              <thead className="text-muted"><tr><th className="text-right">עיר</th><th>מתווכים</th><th>משרדים</th><th>מועמדים</th></tr></thead>
              <tbody>{data.cityCoverage.slice(0, 15).map((c) => (
                <tr key={c.city} className="border-line border-b"><td className="py-1 font-bold">{c.city}</td><td className="text-center tabular-nums">{fmt(c.brokersScanned)}</td><td className="text-center tabular-nums">{fmt(c.offices)}</td><td className="text-center tabular-nums">{fmt(c.candidates)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {data.contradictions.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"><b>סתירות:</b><ul className="mt-1 list-disc pr-5">{data.contradictions.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

// ── City discovery audit panel (read-only) ───────────────────────────────────
function CityAuditPanel({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("קריית ביאליק");
  const [data, setData] = useState<CityDiscoveryAudit | null>(null);
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try { setData(await getCityDiscoveryAuditAction(city)); } finally { setPending(false); }
  };

  return (
    <section className="border-line bg-card rounded-3xl border p-5 sm:p-6">
      <h2 className="text-ink text-lg font-black">🔎 כיסוי גילוי לפי עיר</h2>
      <p className="text-muted mt-1 text-[12px]">אבחון קריאה-בלבד: למה בעיר מסוימת זוהו מעט משרדים, ומה חסר.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} list="city-list" placeholder="עיר (למשל קריית ביאליק)"
          className="border-line bg-surface text-ink min-w-[220px] rounded-full border px-3 py-1.5 text-sm" />
        <datalist id="city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        <button onClick={run} disabled={pending || !city.trim()} className="bg-brand-strong rounded-xl px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "מאבחן…" : "הרץ אבחון"}</button>
      </div>

      {data && (
        <div className="mt-4 flex flex-col gap-3 text-[12px]">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-bold text-amber-800">
            מסקנה: {AUDIT_HE[data.classification]} · {data.city}{data.cityVariants.length > 1 ? ` · איותים: ${data.cityVariants.join(" / ")}` : ""}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="מתווכים נסרקו" value={fmt(data.brokersScanned)} />
            <Mini label="שויכו למשרד" value={fmt(data.brokersWithOffice)} tone="green" />
            <Mini label="במחקר" value={fmt(data.brokersResearching)} tone="amber" />
            <Mini label="משרדים פעילים" value={fmt(data.officesActive)} tone="green" />
            <Mini label="מועמדי משרד" value={fmt(data.candidates.total)} />
            <Mini label="מודעות בעיר" value={fmt(data.officeNameEvidence.listingsInCity)} />
          </div>
          <div className="text-muted">
            ראיות שם-משרד מהמקור: <b>{fmt(data.officeNameEvidence.withDetectedOfficeName)}</b> מודעות עם שם משרד · <b>{fmt(data.officeNameEvidence.brandMentions)}</b> אזכורי מותג · <b>{fmt(data.officeNameEvidence.distinctOfficeNames)}</b> שמות משרד שונים.
          </div>
          {data.officeNameEvidence.topOfficeNames.length > 0 && (
            <div>
              <b>שמות משרד נפוצים בראיות:</b>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.officeNameEvidence.topOfficeNames.map((n) => (
                  <span key={n.name} className="bg-surface text-muted rounded-full px-2 py-0.5 font-bold">{n.name} ({n.count})</span>
                ))}
              </div>
            </div>
          )}
          {data.officesList.length > 0 && (
            <div>
              <b>משרדים שנוצרו:</b>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.officesList.map((o) => <Link key={o.id} href={`/brokerage-data/office/${o.id}`} className="bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 font-bold hover:underline">{o.name} · {o.brokerCount} סוכנים</Link>)}
              </div>
            </div>
          )}
          {data.notes.length > 0 && (
            <ul className="text-muted list-disc space-y-1 pr-5">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────
function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-brand/30 bg-brand-soft/20" : "border-line bg-card"}`}>
      <div className={`text-2xl font-black tabular-nums ${accent ? "text-brand-strong" : "text-ink"}`}>{value}</div>
      <div className="text-ink mt-0.5 text-[12px] font-bold">{label}</div>
      {hint && <div className="text-muted mt-0.5 text-[11px]">{hint}</div>}
    </div>
  );
}
function GraphNode({ value, label, tone }: { value: string; label: string; tone?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 text-center ${tone ? "border-brand/30 bg-brand-soft/30" : "border-line bg-surface"}`}>
      <div className={`text-lg font-black tabular-nums ${tone ? "text-brand-strong" : "text-ink"}`}>{value}</div>
      <div className="text-muted text-[10px] font-bold">{label}</div>
    </div>
  );
}
function Arrow() { return <span className="text-brand/50 text-lg font-black">←</span>; }

function StateCard({ tone, emoji, title, value, desc }: { tone: "green" | "amber" | "red"; emoji: string; title: string; value: string; desc: string }) {
  const ring = tone === "green" ? "border-emerald-200 bg-emerald-50/40" : tone === "amber" ? "border-amber-200 bg-amber-50/40" : "border-rose-200 bg-rose-50/40";
  const col = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-rose-700";
  return (
    <div className={`rounded-2xl border p-4 ${ring}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-black">{emoji} {title}</span>
        <span className={`text-2xl font-black tabular-nums ${col}`}>{value}</span>
      </div>
      <p className="text-muted mt-1.5 text-[11px] leading-relaxed">{desc}</p>
    </div>
  );
}
function Mini({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  const col = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "text-ink";
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2.5">
      <div className={`text-lg font-black tabular-nums ${col}`}>{value}</div>
      <div className="text-muted mt-0.5 text-[11px]">{label}</div>
    </div>
  );
}
function OfficeCard({ o }: { o: OfficeIndexItem }) {
  const initial = (o.name || "?").trim().charAt(0);
  return (
    <Link href={`/brokerage-data/office/${o.id}`}
      className="border-line bg-card hover:border-brand/50 hover:shadow-md group flex flex-col gap-3 rounded-2xl border p-4 transition-all">
      <div className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-black">{initial}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-ink truncate text-base font-black">{o.name}</h3>
            <span className="text-muted shrink-0 text-[11px] font-bold tabular-nums">{Math.round(o.confidenceScore)}%</span>
          </div>
          <p className="text-muted truncate text-[12px]">{[o.brandNetwork, o.city].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{fmt(o.agentCount)} סוכנים</span>
        <span className="bg-surface text-muted rounded-full px-2 py-0.5 font-bold">{fmt(o.listingCount)} נכסים</span>
        <span className="text-brand-strong ms-auto font-bold opacity-0 transition-opacity group-hover:opacity-100">Office Intelligence →</span>
      </div>
    </Link>
  );
}
