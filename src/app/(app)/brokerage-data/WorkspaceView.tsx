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
import type { AgentReport, ResearchDepth } from "@/lib/brokerage-data/research-agent/types";
import { STAGE_HE } from "@/lib/brokerage-data/research-agent/explain";
import type { CityBrokerageCensus, CityKnowledgeStatus } from "@/lib/brokerage-data/brokerage-knowledge";
import type { EnsureCityResult } from "@/lib/brokerage-data/city-lazy-learning";
import {
  getBrokerageOfficesIndexAction, getResearchSnapshotAction,
  getCityDiscoveryAuditAction, auditBrokerageDiscoveryPipelineAction,
  discoverBrokerageOfficesForCityAction, getCityBrokerageCensusAction,
  getCityKnowledgeStatusAction, ensureCityBrokerageKnowledgeAction, runBrokerResearchAction,
  seedCityAICandidatesAction, runBrokerageResearchAgentAction, crossCheckCityRepositoriesAction,
} from "@/lib/brokerage-data/actions";
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
          <CityKnowledgeStatusPanel cities={index?.cities ?? []} onChanged={reload} />
          <CityCensusPanel cities={index?.cities ?? []} />
          <CityDiscoveryPanel cities={index?.cities ?? []} onChanged={reload} />
          <PipelineAuditPanel />
          <CityAuditPanel cities={index?.cities ?? []} />
        </div>
      )}
    </div>
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
  // Phase 26.4.13 — multi-step Brokerage Research Agent.
  const [agent, setAgent] = useState<AgentReport | null>(null);
  const [agentDepth, setAgentDepth] = useState<ResearchDepth>("standard");
  const [agentPending, setAgentPending] = useState(false);
  const [agentErr, setAgentErr] = useState<string | null>(null);

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

  const runAgent = async () => {
    setAgentPending(true); setAgentErr(null);
    try {
      const r = await runBrokerageResearchAgentAction(city, agentDepth);
      if (r.ok) { setAgent(r.result ?? null); await onChanged().catch(() => {}); } else setAgentErr(r.error ?? "נכשל");
    } catch (e) { setAgentErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setAgentPending(false); }
  };

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
        <button onClick={runAgent} disabled={agentPending || !city.trim()} className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-1.5 text-sm font-bold text-indigo-800 disabled:opacity-60">{agentPending ? "חוקר…" : "🧠 חקור את שוק התיווך בעיר"}</button>
      </div>
      {agentErr && <p className="mt-2 font-semibold text-rose-700">{agentErr}</p>}
      {agentPending && <p className="text-muted mt-1 text-[11px]">הסוכן מריץ חיפוש רב-שלבי (רשתות · עצמאיים · מדריכים · פורטלים · חברתי · הצלבה). ניתן להריץ שוב להשלמה.</p>}

      {agent && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-indigo-900 font-black">🧠 סוכן חקר שוק התיווך — {agent.city} ({agent.depth})</span>
            <span className="text-muted text-[11px]">{fmt(agent.searchesCompleted)} חיפושים · {fmt(agent.sourcesChecked)} מקורות · {(agent.elapsedMs / 1000).toLocaleString("he-IL", { maximumFractionDigits: 1 })}ש׳</span>
          </div>
          {!agent.aiConfigured && <p className="font-semibold text-rose-700">מנוע ה-AI אינו מוגדר (חסר OPENAI_API_KEY) — חילוץ שמות מוגבל לזיהוי רשתות.</p>}
          {!agent.searchConfigured && <p className="font-semibold text-amber-700">⚠ אין ספק חיפוש ציבורי — לא בוצע אימות; המועמדים נשמרו כ״במחקר״.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Mini label="נמצאו" value={fmt(agent.candidatesFound)} />
            <Mini label="נשמרו (במחקר)" value={fmt(agent.candidatesSaved)} tone="amber" />
            <Mini label="אומתו" value={fmt(agent.candidatesVerified)} tone="green" />
            <Mini label="במחקר" value={fmt(agent.candidatesResearching)} tone="amber" />
            <Mini label="ממתינים לראיה" value={fmt(agent.candidatesWaitingForEvidence)} />
            <Mini label="נדחו" value={fmt(agent.candidatesRejected)} tone="red" />
          </div>
          <div className="text-muted text-[11px]"><b>שלבים:</b> {agent.stagesRun.map((st) => STAGE_HE[st]).join(" ← ") || "—"}</div>
          {agent.steps.length > 0 && <div className="text-muted text-[11px]"><b>מהלך:</b> {agent.steps.join(" ← ")}</div>}
          {agent.timedOut && <p className="font-semibold text-amber-700">הפעולה התחילה אך עשויה להמשיך בהרצה הבאה / ידנית — חלק מהמועמדים ממתינים לאימות.</p>}
          {agent.candidates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {agent.candidates.slice(0, 40).map((c, i) => (
                <div key={i} className="border-line bg-surface rounded-xl border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink font-bold">{c.officeName}{c.brandNetwork ? <span className="text-muted font-normal"> · {c.brandNetwork}{c.branch ? ` (${c.branch})` : ""}</span> : ""}</span>
                    <span className="flex items-center gap-2 text-[11px]">
                      {c.status === "verified"
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">מאומת · ראיה ציבורית</span>
                        : c.status === "rejected"
                          ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">נדחה</span>
                          : c.researched
                            ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-700">במחקר</span>
                            : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">ממתין לראיה</span>}
                      <span className="text-muted tabular-nums" title="ביטחון מערכת (ראיות)">מערכת {c.systemConfidence}%</span>
                    </span>
                  </div>
                  {c.aliases.length > 1 && <div className="text-muted mt-1 text-[11px]"><b>וריאציות:</b> {c.aliases.join(" · ")}</div>}
                  {c.sourcesChecked.length > 0 && <div className="text-muted mt-0.5 text-[11px]"><b>מקורות שנבדקו:</b> {c.sourcesChecked.join(" · ")}</div>}
                  {c.evidenceFound.length > 0 && <div className="mt-0.5 text-[11px] text-emerald-700"><b>ראיות:</b> {c.evidenceFound.join(" · ")}</div>}
                  <div className="text-muted mt-0.5 text-[11px] italic">{c.verdictReason}</div>
                </div>
              ))}
            </div>
          )}
          {agent.gaps.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-amber-800"><b>פערים:</b><ul className="list-disc pr-5">{agent.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
          {agent.notes.length > 0 && <ul className="text-muted list-disc pr-5">{agent.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
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
