"use client";
// ============================================================================
// 🏢 Brokerage Intelligence Workspace™ (Phase 26.4.1) — office-first operational
// intelligence center (RTL, premium). PRESENTATION + WORKFLOW ONLY: it composes
// existing read models (command center · offices index · research snapshot ·
// registry snapshot) and the existing resumable research engine. No engine /
// schema / API / calculation changes. The human observes the autonomous research
// pipeline; manual action is reserved for rare conflicts.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BrokerageCommandCenter } from "@/lib/brokerage-data/service";
import type { OfficesIndex, OfficeIndexItem } from "@/lib/brokerage-data/office-profile";
import type { ResearchSnapshot } from "@/lib/brokerage-data/broker-research/engine";
import {
  getBrokerageOfficesIndexAction, getResearchSnapshotAction, runBrokerResearchAction,
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

type OfficeSort = "active" | "largest" | "confidence";

export function WorkspaceView({ cc }: { cc: BrokerageCommandCenter }) {
  const ov = cc.overview;
  const topAgents = ov.topAgentsByListings;
  const [index, setIndex] = useState<OfficesIndex | null>(null);
  const [research, setResearch] = useState<ResearchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<OfficeSort>("active");

  // Autonomous research loop (reuses the resumable engine — observation, not approval).
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState<{ done: number; total: number; linked: number } | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const stop = useRef(false);

  const reload = async () => {
    const [idx, res] = await Promise.all([
      getBrokerageOfficesIndexAction(), getResearchSnapshotAction(),
    ]);
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
        if (stop.current) { setScanMsg("המחקר הושהה. הוא ימשיך מהנקודה שנעצרה."); break; }
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

  // ── Office directory (primary) ──────────────────────────────────────────────
  const offices = useMemo(() => {
    const list = index?.offices ?? [];
    const needle = q.trim();
    const filtered = list.filter((o) =>
      !needle || o.name.includes(needle) || (o.brandNetwork ?? "").includes(needle) ||
      (o.city ?? "").includes(needle) || (o.phone ?? "").includes(needle));
    return [...filtered].sort((a, b) =>
      sort === "largest" ? b.agentCount - a.agentCount :
      sort === "confidence" ? b.confidenceScore - a.confidenceScore :
      b.listingCount - a.listingCount);
  }, [index, q, sort]);

  // ── Knowledge-graph + coverage numbers (all from existing read models) ──────
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
  const researchCompletion = research ? pct(research.counts.researched, research.counts.researched + research.unresearched) : autoMatchRate;

  // ── Broker directory (secondary) — grouped by office ────────────────────────
  const brokersByOffice = useMemo(() => {
    const groups = new Map<string, typeof topAgents>();
    for (const a of topAgents) {
      const key = a.officeName ?? "טרם שויך למשרד";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
    }
    return [...groups.entries()];
  }, [topAgents]);

  const scrollToInvestigation = () => document.getElementById("research-workspace")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* ── Hero ── */}
      <section className="border-line bg-card relative overflow-hidden rounded-3xl border p-6 sm:p-8">
        <div className="bg-brand-soft/40 pointer-events-none absolute -top-28 -start-24 h-64 w-64 rounded-full blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-brand text-[11px] font-black tracking-[0.2em]">NATIONAL BROKERAGE KNOWLEDGE GRAPH</p>
            <h1 className="text-ink mt-1 text-3xl font-black sm:text-4xl">🏢 Brokerage Intelligence Workspace™</h1>
            <p className="text-muted mt-2 max-w-2xl text-sm leading-relaxed">
              ZONO בונה ומתחזק את גרף המודיעין הלאומי של שוק התיווך — משרדים, מתווכים, נכסים, שכונות ושליטה טריטוריאלית. המערכת חוקרת באופן אוטונומי; אתם מנהלים מודיעין, לא מזינים נתונים.
            </p>
          </div>
          {index && (
            <div className="border-brand/30 bg-brand-soft/30 shrink-0 rounded-2xl border px-4 py-3 text-center">
              <div className="text-brand-strong text-3xl font-black tabular-nums">{coverage}%</div>
              <div className="text-muted text-[11px] font-bold">כיסוי ידע</div>
            </div>
          )}
        </div>

        {/* Knowledge-graph flow strip */}
        <div className="relative mt-6 flex flex-wrap items-center gap-2 text-sm">
          <GraphNode value={fmt(totalOffices)} label="משרדים" tone />
          <Arrow />
          <GraphNode value={fmt(verifiedBrokers)} label="מתווכים מאומתים" />
          <Arrow />
          <GraphNode value={fmt(listings)} label="נכסים" />
          <Arrow />
          <GraphNode value={fmt(citiesCovered)} label="ערים" />
          <Arrow />
          <GraphNode value={`${coverage}%`} label="כיסוי" tone />
        </div>
      </section>

      {/* ── National Brokerage Overview ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="משרדים מאומתים" value={fmt(verifiedOffices)} hint={`${fmt(totalOffices)} סה״כ`} accent />
        <Kpi label="מתווכים שזוהו" value={fmt(detectedBrokers)} hint={`${fmt(verifiedBrokers)} מאומתים`} />
        <Kpi label="שיוך אוטומטי" value={`${autoMatchRate}%`} hint="מתווכים↔משרד" accent />
        <Kpi label="ערים בכיסוי" value={fmt(citiesCovered)} hint={`${fmt(listings)} נכסים`} />
        <Kpi label="משרדים חדשים" value={`+${fmt(lastRun?.newOffices ?? 0)}`} hint="בסריקה האחרונה" />
        <Kpi label="סריקה אחרונה" value={timeAgo(ov.latestRefreshRun?.finishedAt ?? null)} hint={ov.latestRefreshRun?.status === "completed" ? "הושלמה" : ov.latestRefreshRun?.status ?? "—"} />
      </div>

      {/* ── Autonomous Research™ (replaces manual review queue) ── */}
      <section className="border-line bg-card rounded-3xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-ink text-lg font-black">🧠 Autonomous Research™</h2>
            <p className="text-muted mt-1 max-w-2xl text-[12px] leading-relaxed">
              המערכת חוקרת מתווכים שטרם שויכו ממקורות ציבוריים, מעשירה פרופילים ומשייכת אוטומטית כשהביטחון חוצה את הסף. התערבות ידנית נדרשת רק בקונפליקטים נדירים.
            </p>
          </div>
          {research?.searchConfigured && (
            <button onClick={runAutonomous}
              className="bg-brand-strong hover:bg-brand-strong/90 shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-60">
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

        {/* Broker research states */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StateCard tone="green" emoji="🟢" title="מאומתים" value={fmt(verifiedBrokers)} desc="משרד זוהה בוודאות — שויך אוטומטית." />
          <StateCard tone="amber" emoji="🟡" title="במחקר" value={fmt(researching)} desc="אין עדיין ראיה מספקת — המערכת ממשיכה לחקור אוטומטית." action={{ label: "פתח חקירה", onClick: scrollToInvestigation }} />
          <StateCard tone="red" emoji="🔴" title="קונפליקט" value={fmt(conflicts)} desc="מקורות ציבוריים אמינים סותרים — נדרשת הכרעה ידנית." action={conflicts > 0 ? { label: "פתח חקירה", onClick: scrollToInvestigation } : undefined} />
        </div>

        {/* Why still researching — actionable classification (from research snapshot) */}
        {research && (research.counts.needsReview > 0 || research.counts.insufficient > 0) && (
          <div className="text-muted mt-4 flex flex-wrap gap-2 text-[11px]">
            <span className="bg-amber-50 rounded-full px-2.5 py-1 font-bold text-amber-700">{fmt(research.counts.needsReview)} ממתינים לראיה נוספת</span>
            <span className="bg-slate-100 rounded-full px-2.5 py-1 font-bold text-slate-600">{fmt(research.counts.insufficient)} משרד טרם זוהה</span>
            <span className="bg-emerald-50 rounded-full px-2.5 py-1 font-bold text-emerald-700">{fmt(research.counts.candidates)} מועמדי משרד שנוצרו</span>
          </div>
        )}
      </section>

      {/* ── Office Directory (PRIMARY) ── */}
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

        {loading ? (
          <div className="border-line bg-surface text-muted rounded-2xl border p-8 text-center text-sm">טוען מדריך משרדים…</div>
        ) : offices.length === 0 ? (
          <div className="border-line bg-surface text-muted rounded-2xl border border-dashed p-8 text-center text-sm">
            עדיין אין משרדים מאומתים. הפעל מחקר אוטונומי כדי לבנות את גרף המשרדים.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offices.slice(0, 60).map((o) => <OfficeCard key={o.id} o={o} />)}
          </div>
        )}
      </section>

      {/* ── Research / Discovery Summary ── */}
      <section className="border-line bg-card rounded-3xl border p-5 sm:p-6">
        <h2 className="text-ink text-lg font-black">📡 סיכום מחקר אחרון</h2>
        <p className="text-muted mt-1 text-[12px]">{ov.latestRefreshRun?.finishedAt ? `עודכן ${timeAgo(ov.latestRefreshRun.finishedAt)}` : "טרם בוצעה סריקה לאומית."}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Mini label="משרדים חדשים" value={fmt(lastRun?.newOffices ?? 0)} />
          <Mini label="מתווכים חדשים" value={fmt(lastRun?.newAgents ?? 0)} />
          <Mini label="פרופילים הועשרו" value={fmt(lastRun?.updatedRecords ?? 0)} />
          <Mini label="עדיין במחקר" value={fmt(researching)} tone="amber" />
          <Mini label="קונפליקטים" value={fmt(conflicts)} tone={conflicts > 0 ? "red" : undefined} />
          <Mini label="השלמת מחקר" value={`${researchCompletion}%`} tone="green" />
        </div>
      </section>

      {/* ── Broker Directory (secondary, grouped by office) ── */}
      <details className="border-line bg-card rounded-3xl border p-5">
        <summary className="text-ink cursor-pointer text-lg font-black">מדריך מתווכים <span className="text-muted text-sm font-normal">(משני · מקובץ לפי משרד)</span></summary>
        <div className="mt-4 flex flex-col gap-4">
          {brokersByOffice.length === 0 ? (
            <p className="text-muted text-sm">אין מתווכים להצגה.</p>
          ) : brokersByOffice.map(([office, brokers]) => (
            <div key={office}>
              <h3 className="text-brand-strong mb-1.5 text-sm font-black">🏢 {office} <span className="text-muted font-normal">({brokers.length})</span></h3>
              <div className="flex flex-col gap-1.5">
                {brokers.slice(0, 8).map((b) => (
                  <Link key={b.id} href={`/broker-intelligence/${b.id}`}
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
      </details>
    </div>
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

function StateCard({ tone, emoji, title, value, desc, action }: {
  tone: "green" | "amber" | "red"; emoji: string; title: string; value: string; desc: string;
  action?: { label: string; onClick: () => void };
}) {
  const ring = tone === "green" ? "border-emerald-200 bg-emerald-50/40" : tone === "amber" ? "border-amber-200 bg-amber-50/40" : "border-rose-200 bg-rose-50/40";
  const col = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-rose-700";
  return (
    <div className={`rounded-2xl border p-4 ${ring}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-black">{emoji} {title}</span>
        <span className={`text-2xl font-black tabular-nums ${col}`}>{value}</span>
      </div>
      <p className="text-muted mt-1.5 text-[11px] leading-relaxed">{desc}</p>
      {action && <button onClick={action.onClick} className={`mt-2 text-[11px] font-bold ${col} hover:underline`}>{action.label} →</button>}
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
