"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { SmartPropertyGrid, type MatchSummary } from "@/components/listings/SmartListings";
import {
  buildMarketAnalysisAction,
  getImportDiagnosticsAction,
  importMadlanAction,
  importYad2Action,
  promoteExternalListingAction,
  syncNowAction,
} from "@/lib/external-listings/actions";
import { recalcDecisionBrainAction } from "@/lib/decision-intelligence/actions";
import { createBrokerFromListingAction, decideListingMatchAction, runBrokerDetectionAction } from "@/lib/broker/actions";
import { openAcquisitionAction } from "@/lib/acquisition/actions";
import type { ImportDiagnostics } from "@/lib/external-listings/service";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["external_listings"]["Row"];
const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", facebook: "פייסבוק", manual_external: "ידני", partner_api: "שותף" };
const DETECTION_STATUS: Record<string, { label: string; cls: string }> = {
  auto: { label: "זוהה אוטומטית", cls: "text-success" },
  needs_review: { label: "דורש בדיקה", cls: "text-warning" },
  approved: { label: "אושר ידנית", cls: "text-success" },
  rejected: { label: "נדחה ידנית", cls: "text-danger" },
  unknown: { label: "לא ידוע", cls: "text-muted" },
};
const SOURCE_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  private_seller: { label: "מוכר פרטי", cls: "bg-success-soft text-success" },
  broker: { label: "פרסום מתווך", cls: "bg-warning-soft text-warning" },
  agency: { label: "משרד תיווך", cls: "bg-danger-soft text-danger" },
  office: { label: "נכס בבלעדיות", cls: "bg-brand-soft text-brand-strong" },
  exclusive: { label: "נכס בבלעדיות", cls: "bg-brand-soft text-brand-strong" },
  unknown: { label: "לא ידוע", cls: "bg-surface text-muted" },
};
const field = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-3 text-sm outline-none transition";
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

/** Inline hover preview — no navigation. Card appears below the trigger. */
function HoverPreview({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="group/hp relative inline-block">
      {trigger}
      <span className="border-line bg-card pointer-events-none absolute top-full start-0 z-30 mt-1 hidden w-72 rounded-xl border p-3 text-start shadow-[var(--shadow-lift)] group-hover/hp:block">
        {children}
      </span>
    </span>
  );
}

interface DebugReport {
  success: boolean;
  provider: string;
  actorId: string;
  runStatus: string;
  datasetItems: number;
  rawSample: Record<string, unknown> | null;
  normalizedSample: Record<string, unknown> | null;
  missingFields: string[];
  error: string | null;
  env: { apifyToken: boolean; yad2ActorId: boolean; madlanActorId: boolean; cronSecret: boolean };
}

export function ExternalListingsView({ listings, marketStats, isAdmin = false, matches = {} }: { listings: Row[]; marketStats?: { priceDrops: number; duplicateCandidates: number }; isAdmin?: boolean; matches?: Record<string, MatchSummary> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [diag, setDiag] = useState<ImportDiagnostics | null>(null);
  const [pending, start] = useTransition();
  const [dayAgo] = useState(() => Date.now() - 86_400_000);
  // Admin actor-verification debug tool
  const [dbgCity, setDbgCity] = useState("");
  const [dbgSave, setDbgSave] = useState(false);
  const [dbgBusy, setDbgBusy] = useState(false);
  const [dbgReport, setDbgReport] = useState<DebugReport | null>(null);
  const [dbgError, setDbgError] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<"quick" | "standard" | "full" | "backfill">("standard");
  const [source, setSource] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [minRooms, setMinRooms] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const run = (fn: () => Promise<{ error?: string; summary?: { inserted: number; updated: number; errors: string[] } }>) => {
    setError(null); setMsg(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else if (r?.summary) {
        setMsg(`סונכרן: ${r.summary.inserted} חדשים, ${r.summary.updated} עודכנו${r.summary.errors.length ? ` · ${r.summary.errors.length} שגיאות` : ""}`);
        if (r.summary.errors.length) setError(`שגיאות ייבוא: ${r.summary.errors.slice(0, 3).join(" | ")}`);
        router.refresh();
      } else router.refresh();
    });
  };
  const analyze = () => { setError(null); start(async () => { const r = await buildMarketAnalysisAction(); if (r.error) setError(r.error); else setAnalysis(r.text ?? ""); }); };
  const recalcBrain = () => { setError(null); setMsg(null); start(async () => { const r = await recalcDecisionBrainAction(); if (r?.error) setError(r.error); else setMsg("מרכז הפיקוד חושב מחדש — המודעות החיצוניות עודכנו בו ✓"); }); };
  const loadDiag = () => { setError(null); start(async () => { setDiag(await getImportDiagnosticsAction()); }); };
  const bk = (fn: () => Promise<{ error?: string; message?: string }>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const runDebug = async (provider: string) => {
    if (!dbgCity.trim()) { setDbgError("הזן עיר לבדיקה"); return; }
    setDbgError(null); setDbgReport(null); setDbgBusy(true);
    try {
      const res = await fetch("/api/external-listings/debug-provider", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, city: dbgCity.trim(), limit: 5, saveSample: dbgSave }),
      });
      const json = await res.json();
      if (!res.ok) setDbgError(json.error ?? "בדיקה נכשלה");
      else setDbgReport(json as DebugReport);
    } catch (e) {
      setDbgError(e instanceof Error ? e.message : "בדיקה נכשלה");
    } finally {
      setDbgBusy(false);
    }
  };

  const filtered = useMemo(() => listings.filter((l) => {
    if (source && l.source !== source) return false;
    if (sourceType && l.listing_source_type !== sourceType) return false;
    if (minRooms && (l.rooms ?? 0) < Number(minRooms)) return false;
    if (minPrice && (l.price ?? 0) < Number(minPrice)) return false;
    if (maxPrice && (l.price ?? Infinity) > Number(maxPrice)) return false;
    return true;
  }), [listings, source, sourceType, minRooms, minPrice, maxPrice]);

  const stats = useMemo(() => {
    const bySource: Record<string, number> = {};
    let priceSum = 0, priceN = 0; const sqmPrices: number[] = [];
    for (const l of filtered) {
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
      if (l.price) { priceSum += l.price; priceN++; }
      if (l.price && l.sqm) sqmPrices.push(l.price / l.sqm);
    }
    const avgSqm = sqmPrices.length ? Math.round(sqmPrices.reduce((a, b) => a + b, 0) / sqmPrices.length) : 0;
    return { bySource, avgPrice: priceN ? Math.round(priceSum / priceN) : 0, avgSqm, belowThreshold: avgSqm * 0.9 };
  }, [filtered]);

  // ── External market intelligence (computed across all listings) ──────────────
  const market = useMemo(() => {
    // per-city ₪/m² averages for an accurate below-average flag
    const cityAcc: Record<string, { sum: number; n: number }> = {};
    for (const l of listings) if (l.city && l.price && l.sqm) { (cityAcc[l.city] ??= { sum: 0, n: 0 }); cityAcc[l.city].sum += l.price / l.sqm; cityAcc[l.city].n++; }
    const cityAvg: Record<string, number> = {};
    for (const [c, a] of Object.entries(cityAcc)) cityAvg[c] = a.n ? a.sum / a.n : 0;
    let newToday = 0, belowAvg = 0, privateOwner = 0, bestOpp = 0;
    for (const l of listings) {
      if (l.first_seen_at && new Date(l.first_seen_at).getTime() >= dayAgo) newToday++;
      if (l.city && l.price && l.sqm && cityAvg[l.city] > 0 && l.price / l.sqm <= cityAvg[l.city] * 0.9) belowAvg++;
      if (l.has_agent === false) privateOwner++;
      if (l.opportunity_score >= 70) bestOpp++;
    }
    return { newToday, belowAvg, privateOwner, bestOpp, priceDrops: marketStats?.priceDrops ?? 0, duplicates: marketStats?.duplicateCandidates ?? 0 };
  }, [listings, marketStats, dayAgo]);

  const marketCards: { label: string; value: number; icon: string; tone: string }[] = [
    { label: "חדשות היום", value: market.newToday, icon: "Sparkles", tone: "text-brand-strong" },
    { label: "ירידות מחיר", value: market.priceDrops, icon: "TrendingDown", tone: "text-warning" },
    { label: "מתחת לממוצע", value: market.belowAvg, icon: "Tag", tone: "text-success" },
    { label: "בעלים פרטי", value: market.privateOwner, icon: "UserCheck", tone: "text-brand" },
    { label: "חשד לכפילות", value: market.duplicates, icon: "Eye", tone: "text-muted" },
    { label: "הזדמנויות מובילות", value: market.bestOpp, icon: "TrendingUp", tone: "text-success" },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-4">
        <div>
          <p className="text-ink flex items-center gap-1.5 text-base font-black">AI Market Intelligence <Icon name="Sparkles" size={15} className="text-brand" /></p>
          <p className="text-muted text-xs">עסקאות ונתונים דומים המשפיעים על השוק · {filtered.length} תוצאות · מדורג לפי AI Score</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => run(importYad2Action)} disabled={pending}>יד2</Button>
          <Button size="sm" variant="secondary" onClick={() => run(importMadlanAction)} disabled={pending}>מדלן</Button>
          <select
            value={syncMode}
            onChange={(e) => setSyncMode(e.target.value as typeof syncMode)}
            className="bg-surface border-line text-ink h-8 rounded-lg border px-2 text-[12px] font-semibold"
            title="מצב סנכרון — קובע כמה מודעות לעיר נמשכות"
          >
            <option value="quick">סנכרון מהיר (50/עיר)</option>
            <option value="standard">סנכרון רגיל (250/עיר)</option>
            <option value="full">סנכרון מלא (500/עיר)</option>
            {isAdmin && <option value="backfill">סנכרון מתקדם (1000/עיר)</option>}
          </select>
          <Button size="sm" onClick={() => run(() => syncNowAction(null, null, syncMode))} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>סנכרן עכשיו</Button>
          <Button size="sm" variant="ghost" onClick={analyze} disabled={pending}>AI Analysis</Button>
          <Button size="sm" variant="ghost" onClick={() => bk(runBrokerDetectionAction)} disabled={pending}>זהה מתווכים</Button>
          <Link href="/broker-intelligence"><Button size="sm" variant="ghost">מודיעין מתווכים</Button></Link>
          <Link href="/acquisition"><Button size="sm" variant="ghost">מודיעין גיוס</Button></Link>
          <Button size="sm" variant="ghost" onClick={recalcBrain} disabled={pending}>חשב מרכז פיקוד מחדש</Button>
          <Button size="sm" variant="ghost" onClick={loadDiag} disabled={pending}>דיבאג ייבוא</Button>
        </div>
      </div>

      {diag && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">דיבאג ייבוא אחרון</p>
          {!diag.apifyConfigured && <p className="text-danger text-xs font-bold">⚠ APIFY_TOKEN לא מוגדר בסביבה.</p>}
          {diag.job ? (
            <div className="text-xs leading-relaxed">
              <p className="text-muted">סטטוס: <b className="text-ink">{diag.job.status}</b> · מקור: {diag.job.provider} · נמצאו {diag.job.total_found} · נשמרו {diag.job.total_imported}</p>
              {diag.job.error && <p className="text-danger mt-1 font-bold">שגיאת job: {diag.job.error}</p>}
              <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-auto">
                {diag.logs.map((l, i) => (
                  <div key={i} className={cn("rounded-lg px-2 py-1", l.level === "error" ? "bg-danger-soft text-danger" : l.level === "debug" ? "bg-surface text-muted" : "text-muted")}>
                    <span className="font-semibold">[{l.level}]</span> {l.message}
                    {l.level === "debug" && l.metadata != null && (
                      <details className="mt-1"><summary className="cursor-pointer text-[11px]">Raw / Mapped / Missing</summary><pre className="whitespace-pre-wrap text-[10px] leading-tight">{JSON.stringify(l.metadata, null, 2).slice(0, 4000)}</pre></details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-muted text-xs">אין ייבוא אחרון.</p>}
        </div>
      )}

      {isAdmin && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-1 text-sm font-extrabold">אימות Actor (כלי אדמין)</p>
          <p className="text-muted mb-3 text-xs">בדיקת actor בודד · עיר אחת · עד 5 מודעות. לא מריץ סנכרון מלא.</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className={field} placeholder="עיר לבדיקה (למשל קרית ביאליק)" value={dbgCity} onChange={(e) => setDbgCity(e.target.value)} />
            <Button size="sm" variant="secondary" onClick={() => runDebug("yad2")} disabled={dbgBusy}>בדוק יד2</Button>
            <Button size="sm" variant="secondary" onClick={() => runDebug("madlan")} disabled={dbgBusy}>בדוק מדלן</Button>
            <label className="text-muted flex items-center gap-1 text-xs"><input type="checkbox" checked={dbgSave} onChange={(e) => setDbgSave(e.target.checked)} /> שמור דגימה</label>
            {dbgBusy && <span className="text-muted text-xs">בודק…</span>}
          </div>
          {(() => {
            const env = dbgReport?.env;
            const chip = (ok: boolean, label: string) => <span key={label} className={cn("rounded-lg px-2 py-1 text-[11px] font-bold", ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{ok ? "✓" : "✗"} {label}</span>;
            return env ? <div className="mb-3 flex flex-wrap gap-1">{chip(env.apifyToken, "APIFY_TOKEN")}{chip(env.yad2ActorId, "YAD2_ACTOR_ID")}{chip(env.madlanActorId, "MADLAN_ACTOR_ID")}{chip(env.cronSecret, "CRON_SECRET")}</div> : null;
          })()}
          {dbgError && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-xs font-semibold">{dbgError}</p>}
          {dbgReport && (
            <div className="text-xs leading-relaxed">
              <p className="text-muted">מקור: <b className="text-ink">{dbgReport.provider}</b> · actor: <span className="text-ink">{dbgReport.actorId}</span> · סטטוס: <b className={dbgReport.success ? "text-success" : "text-danger"}>{dbgReport.runStatus}</b> · פריטים: <b className="text-ink">{dbgReport.datasetItems}</b></p>
              {dbgReport.error && <p className="text-danger mt-1 font-bold">שגיאת Apify: {dbgReport.error}</p>}
              {dbgReport.missingFields.length > 0 && <p className="text-warning mt-1">שדות חסרים: {dbgReport.missingFields.join(", ")}</p>}
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <details open><summary className="text-muted cursor-pointer font-bold">פריט גולמי ראשון</summary><pre className="bg-surface mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[10px] leading-tight">{dbgReport.rawSample ? JSON.stringify(dbgReport.rawSample, null, 2).slice(0, 5000) : "—"}</pre></details>
                <details open><summary className="text-muted cursor-pointer font-bold">פלט ממופה (Normalized)</summary><pre className="bg-surface mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[10px] leading-tight">{dbgReport.normalizedSample ? JSON.stringify(dbgReport.normalizedSample, null, 2).slice(0, 5000) : "—"}</pre></details>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {analysis && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">ניתוח שוק (מוכן ל-AI)</p>
          <pre className="text-muted whitespace-pre-wrap text-xs leading-relaxed">{analysis}</pre>
        </div>
      )}

      {/* Market intelligence */}
      <div>
        <p className="text-muted mb-2 text-xs font-bold">מודיעין שוק חיצוני</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {marketCards.map((c) => (
            <div key={c.label} className="bg-card border-line rounded-2xl border p-3">
              <span className={cn("mb-1 inline-flex", c.tone)}><Icon name={c.icon} size={16} /></span>
              <p className="text-ink text-2xl font-black">{c.value}</p>
              <p className="text-muted text-[11px] font-bold">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-card border-line rounded-2xl border p-3"><p className="text-muted text-[11px] font-bold">מודעות</p><p className="text-ink text-2xl font-black">{filtered.length}</p></div>
        <div className="bg-card border-line rounded-2xl border p-3"><p className="text-muted text-[11px] font-bold">מחיר ממוצע</p><p className="text-ink text-lg font-black">{stats.avgPrice ? formatShekels(stats.avgPrice) : "—"}</p></div>
        <div className="bg-card border-line rounded-2xl border p-3"><p className="text-muted text-[11px] font-bold">מחיר ממוצע/מ״ר</p><p className="text-ink text-lg font-black">{stats.avgSqm ? `${stats.avgSqm.toLocaleString("he-IL")}₪` : "—"}</p></div>
        <div className="bg-card border-line rounded-2xl border p-3"><p className="text-muted text-[11px] font-bold">לפי מקור</p><p className="text-ink text-sm font-bold">{Object.entries(stats.bySource).map(([s, n]) => `${SOURCE_LABELS[s] ?? s} ${n}`).join(" · ") || "—"}</p></div>
      </div>

      {/* Filters */}
      <div className="bg-card border-line flex flex-wrap gap-2 rounded-[20px] border p-3">
        <select className={field} value={source} onChange={(e) => setSource(e.target.value)}><option value="">כל המקורות</option><option value="yad2">יד2</option><option value="madlan">מדלן</option></select>
        <select className={field} value={sourceType} onChange={(e) => setSourceType(e.target.value)}><option value="">כל סוגי הפרסום</option><option value="private_seller">מוכר פרטי</option><option value="broker">פרסום מתווך</option><option value="agency">משרד תיווך</option><option value="unknown">לא ידוע</option></select>
        <input className={field} type="number" placeholder="חדרים מ-" value={minRooms} onChange={(e) => setMinRooms(e.target.value)} />
        <input className={field} type="number" placeholder="מחיר מ-" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
        <input className={field} type="number" placeholder="מחיר עד" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-warning-soft text-warning grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Map" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין מודעות חיצוניות</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״סנכרן עכשיו״ כדי למשוך מודעות מאזורי הפעילות (דורש APIFY_TOKEN; בפיתוח יוחזרו נתוני הדמיה).</p>
        </div>
      ) : (
        <SmartPropertyGrid listings={filtered} matches={matches} />
      )}
    </section>
  );
}
