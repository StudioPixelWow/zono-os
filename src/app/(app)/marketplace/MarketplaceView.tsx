"use client";
// ============================================================================
// 🛒 ZONO — Marketplace Intelligence view (mobile-first RTL). PHASE 58.0.
// Sources + compliance, opportunities (acquisition / buyer-match), price
// anomalies and market health. Every listing opens INTERNALLY; the external
// source is a secondary link only. Alerts are approval-gated.
// ============================================================================
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import type { MarketplaceReport, MarketOpportunity, AreaHealth, SourceInfo } from "@/lib/marketplace-intelligence/types";

const KIND_HE: Record<string, string> = { acquisition: "רכישה", buyer_match: "התאמת קונים", watch: "מעקב" };
const KIND_CLS: Record<string, string> = { acquisition: "bg-success-soft text-success", buyer_match: "bg-brand-soft text-brand", watch: "bg-surface text-muted" };
const COMP_HE: Record<string, string> = { official_api: "אינטגרציה רשמית", manual_assisted: "ייבוא מסייע", planning_only: "תכנון בלבד", unknown: "לא מאומת" };
const COMP_CLS: Record<string, string> = { official_api: "bg-success-soft text-success", manual_assisted: "bg-surface text-muted", planning_only: "bg-warning-soft text-warning", unknown: "bg-danger-soft text-danger" };
const BAND_HE: Record<string, string> = { hot: "מוכר", balanced: "מאוזן", soft: "קונה", unknown: "—" };

export function MarketplaceView({ report }: { report: MarketplaceReport | null }) {
  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · מודיעין שוק חיצוני</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🛒 מרקטפלייס</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">הבנת נוף השוק החיצוני מליסטינגים שכבר יובאו — הזדמנויות רכישה, התאמות קונים, אנומליות מחיר ובריאות שוק. ללא גרידה. כל ליסטינג נפתח בתוך ZONO.</p>
      </div>

      {!report && <p className="text-muted mt-6 text-center text-sm">טעינת מודיעין השוק נכשלה — נסה שוב.</p>}

      {report && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="ליסטינגים" value={report.totals.listings} />
            <Stat label="רכישה" value={report.totals.acquisitions} tone="text-success" />
            <Stat label="התאמות" value={report.totals.buyerMatches} tone="text-brand" />
            <Stat label="אנומליות" value={report.totals.anomalies} tone="text-warning" />
          </div>

          {/* Sources + compliance */}
          <Section title="מקורות ותאימות" icon="Layers">
            <div className="flex flex-wrap gap-1.5">
              {report.sources.map((src) => <SourceChip key={src.key} src={src} />)}
            </div>
          </Section>

          {!report.hasData ? (
            <div className="bg-card border-line rounded-[20px] border p-6 text-center">
              <p className="text-ink text-sm font-extrabold">אין עדיין ליסטינגים חיצוניים</p>
              <p className="text-muted mt-1 text-[13px]">{report.notes[0]}</p>
            </div>
          ) : (
            <>
              {report.opportunities.length > 0 && (
                <Section title={`הזדמנויות (${report.opportunities.length})`} icon="Target">
                  <div className="space-y-2">{report.opportunities.slice(0, 20).map((o) => <OpportunityRow key={o.listingId} o={o} />)}</div>
                </Section>
              )}

              {report.areaHealth.length > 0 && (
                <Section title="בריאות שוק לפי אזור" icon="Map">
                  <div className="space-y-2">{report.areaHealth.slice(0, 10).map((a) => <AreaRow key={a.area} a={a} />)}</div>
                </Section>
              )}
            </>
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
    <div className="bg-surface rounded-xl p-3">
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

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name={icon} size={16} /></span><h2 className="text-ink text-sm font-extrabold">{title}</h2></div>
      {children}
    </div>
  );
}
function Stat({ label, value, tone = "text-brand" }: { label: string; value: number; tone?: string }) {
  return <div className="bg-card border-line rounded-2xl border p-3 text-center"><div className={cn("text-xl font-black", tone)}>{value}</div><div className="text-muted text-[11px] font-bold">{label}</div></div>;
}
