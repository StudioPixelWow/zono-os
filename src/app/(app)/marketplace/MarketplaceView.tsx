"use client";
// ============================================================================
// 🛒 ZONO — Marketplace Intelligence view (mobile-first RTL). PHASE 58.0.
// Sources + compliance, opportunities (acquisition / buyer-match), price
// anomalies and market health. Every listing opens INTERNALLY; the external
// source is a secondary link only. Alerts are approval-gated.
// ============================================================================
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MarketplaceReport, MarketOpportunity, AreaHealth, SourceInfo } from "@/lib/marketplace-intelligence/types";

const KIND_HE: Record<string, string> = { acquisition: "רכישה", buyer_match: "התאמת קונים", watch: "מעקב" };
const KIND_CLS: Record<string, string> = { acquisition: "bg-success-soft text-success", buyer_match: "bg-brand-soft text-brand", watch: "bg-surface text-muted" };
const COMP_HE: Record<string, string> = { official_api: "אינטגרציה רשמית", manual_assisted: "ייבוא מסייע", planning_only: "תכנון בלבד", unknown: "לא מאומת" };
const COMP_CLS: Record<string, string> = { official_api: "bg-success-soft text-success", manual_assisted: "bg-surface text-muted", planning_only: "bg-warning-soft text-warning", unknown: "bg-danger-soft text-danger" };
const BAND_HE: Record<string, string> = { hot: "מוכר", balanced: "מאוזן", soft: "קונה", unknown: "—" };

export function MarketplaceView({ report }: { report: MarketplaceReport | null }) {
  const chips = report ? [
    { label: "נכסים שנצפו", value: report.totals.listings },
    { label: "הזדמנויות רכישה", value: report.totals.acquisitions },
    { label: "התאמות לקונים", value: report.totals.buyerMatches },
    { label: "אותות חריגים", value: report.totals.anomalies },
  ].filter((c) => c.value > 0) : [];

  return (
    <div dir="rtl" className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 sm:px-6">
      {/* ── HERO — market pulse ──────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="absolute -top-24 -left-16 -z-10 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="mb-1 text-[12px] font-bold tracking-wide text-indigo-300">ZONO · מודיעין שוק</div>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">שוק ההזדמנויות שלך</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-300">כל הנכסים, האותות וההזדמנויות ש-ZONO מזהה באזור שלך — במקום אחד. כל נכס נפתח בתוך ZONO.</p>
        {chips.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {chips.map((c) => (
              <div key={c.label} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur-md">
                <div className="text-2xl font-black tabular-nums sm:text-3xl">{c.value}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-slate-300">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {!report && <p className="text-muted mt-6 text-center text-sm">טעינת מודיעין השוק נכשלה — נסה שוב.</p>}

      {report && (
        <div className="mt-6 space-y-6">
          {!report.hasData ? (
            <div className="bg-card border-line rounded-[20px] border p-8 text-center">
              <p className="text-ink text-base font-extrabold">ZONO סורקת את השוק באזור שלך</p>
              <p className="text-muted mx-auto mt-1 max-w-md text-[13px]">{report.notes[0] ?? "ההזדמנויות יופיעו כאן אוטומטית ברגע שייאספו נכסים."}</p>
            </div>
          ) : (
            <>
              {report.opportunities.length > 0 && (
                <section>
                  <h2 className="text-ink mb-3 text-[17px] font-black">הזדמנויות ש-ZONO מצאה עבורך <span className="text-muted text-[14px] font-bold">({report.opportunities.length})</span></h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{report.opportunities.slice(0, 24).map((o) => <OpportunityRow key={o.listingId} o={o} />)}</div>
                </section>
              )}

              {report.areaHealth.length > 0 && (
                <section>
                  <h2 className="text-ink mb-3 text-[15px] font-black">בריאות השוק לפי אזור</h2>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{report.areaHealth.slice(0, 12).map((a) => <AreaRow key={a.area} a={a} />)}</div>
                </section>
              )}
            </>
          )}

          {/* Sources / provenance — SECONDARY (how ZONO knows). */}
          {report.sources.length > 0 && (
            <details className="bg-card border-line rounded-[20px] border p-4">
              <summary className="text-ink cursor-pointer text-[13px] font-extrabold">איך ZONO יודעת? · מקורות מידע</summary>
              <div className="mt-3 flex flex-wrap gap-1.5">{report.sources.map((src) => <SourceChip key={src.key} src={src} />)}</div>
            </details>
          )}

          {report.notes.map((n, i) => <p key={i} className="text-muted text-[11px] leading-relaxed">🔒 {n}</p>)}
        </div>
      )}
    </div>
  );
}

function SourceChip({ src }: { src: SourceInfo }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", COMP_CLS[src.compliance])} title={src.note}>
      {src.label} · {COMP_HE[src.compliance]}
    </span>
  );
}

function OpportunityRow({ o }: { o: MarketOpportunity }) {
  return (
    <div className="bg-card border-line h-full rounded-xl border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-[13px] font-bold">{o.title}</p>
          <p className="text-muted mt-0.5 text-[11px]">{o.reasons.join(" · ")}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", KIND_CLS[o.kind])}>{KIND_HE[o.kind]}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* INTERNAL FIRST — primary link is always internal. */}
        <Link href={o.route.primaryHref} className="bg-brand-soft text-brand inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-bold">{o.route.primaryLabel} ↗</Link>
        {o.buyerMatches > 0 && <span className="text-muted text-[11px] font-bold">{o.buyerMatches} קונים</span>}
        {o.anomaly.deltaPct != null && <span className={cn("text-[11px] font-bold", o.anomaly.isOpportunity ? "text-success" : "text-muted")}>{o.anomaly.note}</span>}
        <span className="text-muted text-[10px]">ציון {o.score}</span>
        {/* External source is SECONDARY only. */}
        {o.route.external && <a href={o.route.external.url} target="_blank" rel="noopener noreferrer" className="text-muted text-[10px] font-bold underline">{o.route.external.source} (משני)</a>}
      </div>
      <p className="text-muted mt-1 text-[10px]">התראה לסוכן דורשת אישור.</p>
    </div>
  );
}

function AreaRow({ a }: { a: AreaHealth }) {
  return (
    <div className="bg-surface flex items-center justify-between gap-2 rounded-xl p-3">
      <div className="min-w-0">
        <p className="text-ink truncate text-[13px] font-bold">{a.area}</p>
        <p className="text-muted text-[11px]">{a.listings} ליסטינגים · {a.byOwnerCount} מוכר פרטי · {a.anomalyCount} מתומחר נמוך</p>
      </div>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", a.band === "hot" ? "bg-danger-soft text-danger" : a.band === "soft" ? "bg-success-soft text-success" : "bg-surface text-muted")}>שוק {BAND_HE[a.band]}</span>
    </div>
  );
}

