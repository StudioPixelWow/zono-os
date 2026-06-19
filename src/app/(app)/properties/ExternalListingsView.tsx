"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  buildMarketAnalysisAction,
  getImportDiagnosticsAction,
  importMadlanAction,
  importYad2Action,
  promoteExternalListingAction,
  syncNowAction,
} from "@/lib/external-listings/actions";
import type { ImportDiagnostics } from "@/lib/external-listings/service";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["external_listings"]["Row"];
const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", facebook: "פייסבוק", manual_external: "ידני", partner_api: "שותף" };
const field = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-3 text-sm outline-none transition";
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function ExternalListingsView({ listings, marketStats }: { listings: Row[]; marketStats?: { priceDrops: number; duplicateCandidates: number } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [diag, setDiag] = useState<ImportDiagnostics | null>(null);
  const [pending, start] = useTransition();
  const [dayAgo] = useState(() => Date.now() - 86_400_000);
  const [source, setSource] = useState("");
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
  const loadDiag = () => { setError(null); start(async () => { setDiag(await getImportDiagnosticsAction()); }); };

  const filtered = useMemo(() => listings.filter((l) => {
    if (source && l.source !== source) return false;
    if (minRooms && (l.rooms ?? 0) < Number(minRooms)) return false;
    if (minPrice && (l.price ?? 0) < Number(minPrice)) return false;
    if (maxPrice && (l.price ?? Infinity) > Number(maxPrice)) return false;
    return true;
  }), [listings, source, minRooms, minPrice, maxPrice]);

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
          <p className="text-ink text-sm font-extrabold">מודעות חיצוניות (יד2 / מדלן)</p>
          <p className="text-muted text-xs">ייבוא חי דרך Apify מאזורי הפעילות של הארגון. מודעות נשארות חיצוניות עד שתקודם אותן ידנית.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => run(importYad2Action)} disabled={pending}>יד2</Button>
          <Button size="sm" variant="secondary" onClick={() => run(importMadlanAction)} disabled={pending}>מדלן</Button>
          <Button size="sm" onClick={() => run(() => syncNowAction(null, null))} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>סנכרן עכשיו</Button>
          <Button size="sm" variant="ghost" onClick={analyze} disabled={pending}>AI Analysis</Button>
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
        <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
          <table className="w-full min-w-[760px] text-start text-sm">
            <thead className="text-muted border-line border-b text-xs"><tr>{["מודעה", "מקור", "עיר", "מחיר", "חד׳", "מ״ר", "₪/מ״ר", "הזדמנות", ""].map((h) => <th key={h} className="px-4 py-3 text-start font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((l) => {
                const sqmPrice = l.price && l.sqm ? Math.round(l.price / l.sqm) : null;
                const below = sqmPrice != null && stats.belowThreshold > 0 && sqmPrice < stats.belowThreshold;
                return (
                  <tr key={l.id} className={cn("border-line hover:bg-surface border-b last:border-0", below && "bg-success-soft")}>
                    <td className="px-4 py-3">{l.listing_url ? <a href={l.listing_url} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-brand font-bold">{l.title ?? "מודעה"}</a> : <span className="text-ink font-bold">{l.title ?? "מודעה"}</span>}{below && <span className="text-success mr-2 text-[10px] font-bold">מתחת לממוצע</span>}</td>
                    <td className="text-muted px-4 py-3">{SOURCE_LABELS[l.source] ?? l.source}</td>
                    <td className="text-muted px-4 py-3">{l.city ?? "—"}</td>
                    <td className="text-ink px-4 py-3 font-bold">{l.price ? formatShekels(l.price) : "—"}</td>
                    <td className="text-muted px-4 py-3">{l.rooms ?? "—"}</td>
                    <td className="text-muted px-4 py-3">{l.sqm ?? "—"}</td>
                    <td className="text-muted px-4 py-3">{sqmPrice ? sqmPrice.toLocaleString("he-IL") : "—"}</td>
                    <td className={cn("px-4 py-3 font-bold", tone(l.opportunity_score))}>{l.opportunity_score}</td>
                    <td className="px-4 py-3">{l.promoted_property_id ? <span className="text-success text-xs font-bold">קודם ✓</span> : <Button size="sm" variant="ghost" onClick={() => run(() => promoteExternalListingAction(l.id))} disabled={pending}>קדם ל-CRM</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
