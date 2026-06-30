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
import type { CityBrokerageCensus } from "@/lib/brokerage-data/brokerage-knowledge";
import {
  getBrokerageOfficesIndexAction, getResearchSnapshotAction,
  getCityDiscoveryAuditAction, auditBrokerageDiscoveryPipelineAction,
  discoverBrokerageOfficesForCityAction, getCityBrokerageCensusAction, runBrokerResearchAction,
} from "@/lib/brokerage-data/actions";

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
          <CityCensusPanel cities={index?.cities ?? []} />
          <CityDiscoveryPanel cities={index?.cities ?? []} onChanged={reload} />
          <PipelineAuditPanel />
          <CityAuditPanel cities={index?.cities ?? []} />
        </div>
      )}
    </div>
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
            <div className="text-muted text-[11px] font-bold">{data.city} · כיסוי שוק</div>
            <div className="text-brand-strong text-3xl font-black tabular-nums">{data.marketCoveragePct}%</div>
            <div className="text-muted text-[11px]">אומדן משרדים פעילים (מבוסס-ראיות): <b>{fmt(data.estimatedActiveOffices)}</b> · מאומתים <b>{fmt(data.verifiedOffices)}</b> · במחקר <b>{fmt(data.researchingOffices)}</b></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="כיסוי משרדים" value={`${data.officeCoveragePct}%`} tone="green" />
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

  const run = async () => {
    setPending(true); setErr(null);
    try {
      const r = await discoverBrokerageOfficesForCityAction(city, { depth, includePublicResearch: publicResearch, includeBrokerRematch: rematch });
      if (r.ok) { setData(r.result ?? null); await onChanged().catch(() => {}); } else setErr(r.error ?? "נכשל");
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setPending(false); }
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
      </div>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}

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
