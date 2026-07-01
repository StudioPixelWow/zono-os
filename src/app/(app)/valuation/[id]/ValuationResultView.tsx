"use client";
// ============================================================================
// ZONO Price Intelligence — premium result screen (RTL, glass, soft gradients).
// Hero value · KPI cards · AI insights · what-if slider · comparables carousel ·
// broker sold-nearby · pricing strategies · market pulse · PDF builder + send.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { useActionRunner } from "@/components/ui/useActionRunner";
import {
  runValuationAction, generateValuationReportAction, sendValuationReportAsPdfAction,
  createSellerFollowupFromValuationAction, diagnoseValuationEvidenceAction,
  getValuationEvidenceSearchAction, getValuationScanProofAction, getValuationDiscoveryAction,
} from "@/lib/valuation/actions";
import type { ValuationScanProof, ExternalScanClassification } from "@/lib/valuation/external-scan-proof";
import type { ComparableDiscoveryPackage } from "@/lib/valuation/comparable-discovery";
import type { ValuationEvidenceDiagnosis } from "@/lib/valuation/diagnostics";
// Import from the PURE submodules — NOT the barrel — so the server-only engine/
// service/repository never get pulled into this client bundle.
import { FAILURE_MODE_HE, MATCH_LEVEL_HE } from "@/lib/evidence-search/explain";
import type { EvidencePackage, MarketRadiusMode } from "@/lib/evidence-search/types";

const RADIUS_MODE_HE: Record<MarketRadiusMode, string> = {
  conservative: "שמרני (עד 1.5 ק״מ)",
  standard: "סטנדרטי (עד 3 ק״מ)",
  expanded: "מורחב (עד 4 ק״מ)",
};
import { computeWhatIf } from "@/lib/valuation/valuation-engine";
import {
  type ValuationRecord, type StrategyKey, SOURCE_LABEL, DEMAND_LABEL, CONFIDENCE_LABEL,
  STRATEGY_LABEL, VALUATION_DISCLAIMER,
} from "@/lib/valuation/types";

const fmt = (n: number) => n.toLocaleString("he-IL");
function Mini({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  const col = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "text-ink";
  return (
    <div className="border-line bg-surface rounded-lg border px-2 py-1.5 text-center">
      <div className={cn("text-sm font-black tabular-nums", col)}>{value}</div>
      <div className="text-muted text-[10px]">{label}</div>
    </div>
  );
}
const ils = (n: number | null | undefined) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);
const ils0 = (n: number | null | undefined) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);

function Section({ title, icon, children, action }: { title: string; icon: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name={icon} size={18} className="text-brand" /> {title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ValuationResultView({ record, initialReportToken }: { record: ValuationRecord; initialReportToken: string | null }) {
  const runner = useActionRunner();
  const r = record.result;
  const i = record.input;
  const market = record.market;
  const heroImg = record.comparables.find((c) => c.imageUrl)?.imageUrl ?? null;
  const addr = [i.street, i.houseNumber, i.neighborhood, i.city].filter(Boolean).join(" ") || i.city || "נכס";

  const [reportToken, setReportToken] = useState<string | null>(initialReportToken);
  const [sendOpen, setSendOpen] = useState(false);

  const reportUrl = reportToken ? `/valuation-report/${reportToken}` : null;

  // ── states: still computing / draft ─────────────────────────────────────────
  if (record.status !== "completed" || !r) {
    return (
      <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-12 text-center">
        <span className="zono-gradient-glow mx-auto mb-4 grid h-14 w-14 place-items-center rounded-3xl text-white"><Icon name="Calculator" size={26} /></span>
        <h1 className="text-ink text-2xl font-black">{addr}</h1>
        <p className="text-muted mt-1">ההערכה עדיין לא חושבה.</p>
        {runner.error && <p className="mt-3 text-sm font-semibold text-red-600">{runner.error}</p>}
        <button onClick={() => runner.run(() => runValuationAction(record.id), { pendingMessage: "מחשב…", success: () => "ההערכה חושבה." })}
          disabled={runner.pending} className="btn-zono-primary zono-focus-ring mx-auto mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-bold disabled:opacity-60">
          <Icon name="Sparkles" size={16} /> חשב שווי עכשיו
        </button>
      </main>
    );
  }

  // A valuation is only "available" when the engine produced a real value. The
  // engine flags this explicitly (valuationAvailable); we fall back to a value
  // check for older rows that predate the flag. When NOT available, estimatedValue
  // is 0 — and 0 must NEVER be shown as ₪0 (it is insufficient_data, not a price).
  const available = r.valuationAvailable !== false && (r.estimatedValue ?? 0) > 0;
  const noData = !available;
  const conf = r.confidenceScore ?? 0;
  const positives = record.adjustments.filter((a) => a.direction === "positive");
  const negatives = record.adjustments.filter((a) => a.direction === "negative");

  return (
    <main dir="rtl" className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/valuation" className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm font-bold">
          <Icon name="ChevronRight" size={16} /> כל ההערכות
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setSendOpen(true)} className="border-line bg-card text-ink inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold shadow-card hover:shadow-lg">
            <Icon name="Send" size={14} /> שתף דוח
          </button>
          <button onClick={() => runner.run(async () => {
            const res = await generateValuationReportAction(record.id);
            if (res.ok) { setReportToken(res.data.token); if (typeof window !== "undefined") window.open(`/valuation-report/${res.data.token}`, "_blank"); }
            return res;
          }, { id: "pdf", pendingMessage: "מפיק PDF…", success: (res) => (res.ok ? "הדוח נוצר ונפתח." : null) })}
            disabled={runner.busyId === "pdf"} className="btn-zono-primary zono-focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-bold disabled:opacity-60">
            <Icon name="FileText" size={14} /> צור PDF
          </button>
        </div>
      </div>

      {(runner.note || runner.error) && (
        <div className={cn("mb-4 rounded-xl border px-4 py-2 text-sm font-semibold", runner.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {runner.error ?? runner.note}
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-line shadow-card">
        {heroImg ? <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-brand to-[#3b1d6e]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25" />
        <div className="relative px-6 py-10 text-center text-white sm:py-14">
          <p className="text-sm font-bold text-white/85">{addr}</p>
          {(i.rooms || i.builtSqm) && <p className="text-xs text-white/70">{[i.rooms && `${i.rooms} חדרים`, i.builtSqm && `${i.builtSqm} מ"ר`, i.floor != null && `קומה ${i.floor}`].filter(Boolean).join(" · ")}</p>}
          {available ? (
            <>
              <div className="mt-4 inline-block rounded-3xl bg-white/10 px-8 py-5 backdrop-blur-md">
                <p className="text-xs font-bold uppercase tracking-wide text-white/80">שווי מוערך</p>
                <p className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{ils(r.estimatedValue)}</p>
                <p className="mt-1 text-sm text-white/80">טווח {ils(r.lowValue)} – {ils(r.highValue)}</p>
              </div>
              <div className="mx-auto mt-5 max-w-sm">
                <div className="flex items-center justify-between text-xs font-bold text-white/85">
                  <span>ביטחון: {CONFIDENCE_LABEL[r.confidenceLevel ?? "low"]}</span><span>{conf}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-2 rounded-full bg-gradient-to-l from-emerald-300 to-emerald-500" style={{ width: `${conf}%` }} />
                </div>
                <p className="mt-2 text-xs text-white/75">מבוסס על עסקאות, מודעות פעילות ונכסים שמכרת באזור</p>
              </div>
            </>
          ) : (
            // Insufficient data — NEVER show ₪0. Honest message instead of a price.
            <div className="mt-4 inline-block max-w-md rounded-3xl bg-white/10 px-8 py-5 backdrop-blur-md">
              <p className="text-2xl font-black sm:text-3xl">לא ניתן לחשב הערכת שווי</p>
              <p className="mt-1 text-base font-bold text-white/85">חסרים נתונים</p>
              {r.unavailableReason && <p className="mt-2 text-sm leading-relaxed text-white/80">{r.unavailableReason}</p>}
            </div>
          )}
        </div>
      </section>

      {noData && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {r.unavailableReason ?? "לא נמצאו מספיק עסקאות/מודעות להשוואה ישירה באזור."}
          {r.missingData && r.missingData.length > 0 && <span> חסר: {r.missingData.join(", ")}.</span>}
          {r.recommendedAction && <span className="mt-1 block font-normal">המלצה: {r.recommendedAction}</span>}
        </div>
      )}

      {/* KPI cards — only when a real value exists (never render ₪0 prices). */}
      {!noData && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <KpiCard icon="Megaphone" label="מחיר מומלץ לפרסום" value={ils(r.recommendedListingPrice)} tone="brand" sub="אסטרטגיה: מאוזנת" />
          <KpiCard icon="Target" label="מחיר יעד לסגירה" value={ils(r.targetClosingPrice)} tone="warning" sub={`מינימום: ${ils(r.minimumAcceptablePrice)}`} />
          <KpiCard icon="Flame" label="ביקוש באזור" value={DEMAND_LABEL[market?.demandLevel ?? "low"]} tone="success" sub={market ? `${market.transactionCount} עסקאות · ${market.activeListingCount} מודעות` : ""} />
        </div>
      )}

      {/* AI insights — the engine's explanation embeds the value, so only show it
          when a real value exists (otherwise it would read "₪0"). */}
      {!noData && (
        <Section title="AI Insights" icon="Sparkles">
          <div className="border-line bg-card rounded-card border p-5 shadow-card">
            <p className="text-muted mb-4 text-sm leading-relaxed">{r.explanation}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <FactorList title="מעלי ערך" tone="pos" items={positives} />
              <FactorList title="מורידי ערך" tone="neg" items={negatives} />
            </div>
          </div>
        </Section>
      )}

      {/* What-if slider */}
      {!noData && <WhatIf estimated={r.estimatedValue ?? 0} demand={market?.demandLevel ?? "medium"} recommended={r.recommendedListingPrice ?? 0} />}

      {/* Comparables — official transactions / internal properties / external
          listings are classified by source table and NEVER mislabeled. */}
      <ComparablesSection record={record} />

      {/* Broker sold nearby */}
      <BrokerSold record={record} onFollowup={() => runner.run(() => createSellerFollowupFromValuationAction(record.id), { id: "fup", pendingMessage: "יוצר מעקב…", success: (res) => (res.ok && res.data.taskId ? "משימת מעקב נוצרה." : "המעקב נשמר.") })} busy={runner.busyId === "fup"} />

      {/* Pricing strategies — only when a real value exists. */}
      {!noData && (r.strategies ?? []).length > 0 && (
        <Section title="אסטרטגיית תמחור" icon="Layers">
          <div className="grid gap-3 sm:grid-cols-3">
            {(r.strategies ?? []).map((s) => <StrategyCard key={s.key} s={s} />)}
          </div>
        </Section>
      )}

      {/* Market pulse */}
      {market && (
        <Section title="דופק השוק" icon="BarChart3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Pulse label='מחיר ממוצע למ"ר' value={ils(market.avgPricePerSqm)} />
            <Pulse label='מחיר חציוני למ"ר' value={ils(market.medianPricePerSqm)} />
            <Pulse label="ביקוש" value={DEMAND_LABEL[market.demandLevel]} />
            <Pulse label="היצע" value={DEMAND_LABEL[market.supplyLevel]} />
            <Pulse label="מגמה" value={`${market.trendDirection === "up" ? "↑" : market.trendDirection === "down" ? "↓" : "→"} ${market.trendPercent}%`} />
            <Pulse label="פער מודעה-עסקה" value={market.listingToSoldGapPercent != null ? `${market.listingToSoldGapPercent}%` : "—"} />
            <Pulse label="נזילות שוק" value={`${r.liquidityScore}/100`} />
            <Pulse label="ימים בשוק (צפי)" value={`${r.daysOnMarketEstimate}`} />
          </div>
        </Section>
      )}

      {/* PDF builder CTA */}
      <Section title="דוח שווי לבעל נכס" icon="FileText">
        <div className="border-line bg-gradient-to-br from-brand-soft to-card rounded-card border p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={() => runner.run(async () => {
              const res = await generateValuationReportAction(record.id);
              if (res.ok) { setReportToken(res.data.token); if (typeof window !== "undefined") window.open(`/valuation-report/${res.data.token}`, "_blank"); }
              return res;
            }, { id: "pdf2", pendingMessage: "מפיק PDF…", success: (res) => (res.ok ? "הדוח נוצר." : null) })}
              disabled={runner.busyId === "pdf2"} className="btn-zono-primary zono-focus-ring inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60">
              <Icon name="FileText" size={16} /> צור PDF
            </button>
            <CTA icon="Send" label="שלח כ-PDF" onClick={() => setSendOpen(true)} />
            <CTA icon="MessageCircle" label="שלח בוואטסאפ" onClick={() => { setSendOpen(true); }} />
            <CTA icon="Mail" label="שלח במייל" onClick={() => { setSendOpen(true); }} />
            <CTA icon="UserPlus" label="צור פגישת גיוס" onClick={() => runner.run(() => createSellerFollowupFromValuationAction(record.id), { id: "meet", pendingMessage: "יוצר…", success: () => "משימת גיוס נוצרה." })} busy={runner.busyId === "meet"} />
            {reportUrl && <a href={reportUrl} target="_blank" rel="noreferrer" className="border-line bg-card text-ink inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold hover:shadow-lg"><Icon name="Eye" size={16} /> תצוגת דוח</a>}
          </div>
          <p className="text-muted mt-3 text-xs">{VALUATION_DISCLAIMER}</p>
        </div>
      </Section>

      {/* Read-only evidence diagnostic (QA/admin) — collapsed by default. */}
      <DiscoveryPanel valuationId={record.id} />
      <ScanProofPanel valuationId={record.id} />
      <EvidenceDiagnostic valuationId={record.id} />
      <EvidenceSearchPanel valuationId={record.id} />

      {sendOpen && <SendModal valuationId={record.id} hasReport={!!reportToken} onClose={() => setSendOpen(false)} onGenerated={(t) => setReportToken(t)} />}
    </main>
  );
}

// ── VAL-QA-10 — Comparable Discovery Engine panel (full-universe scan proof) ─
const SRC_HE: Record<string, string> = {
  property_transactions: "GovMap (עסקאות רשמיות)", external_listings: "מודעות חיצוניות",
  market_property_sources: "מקורות שוק", properties: "מלאי פנימי", broker_sold: "עסקאות המתווך",
};

function DiscoveryPanel({ valuationId }: { valuationId: string }) {
  const [data, setData] = useState<ComparableDiscoveryPackage | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setPending(true); setErr(null);
    try { const r = await getValuationDiscoveryAction(valuationId); if (r.ok) setData(r.data); else setErr(r.error); }
    catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setPending(false); }
  };

  return (
    <details className="border-brand/40 bg-brand-soft/20 rounded-2xl border p-4">
      <summary className="flex cursor-pointer items-center justify-between">
        <span className="text-ink text-sm font-black">🧭 מנוע גילוי השוואות — הוכחת סריקה מלאה (VAL-QA-10)</span>
        <button onClick={(e) => { e.preventDefault(); run(); }} disabled={pending} className="bg-brand-strong rounded-lg px-3 py-1 text-xs font-bold text-white disabled:opacity-60">{pending ? "סורק…" : "הרץ גילוי"}</button>
      </summary>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && (
        <div className="mt-3 flex flex-col gap-3 text-[12px]">
          {/* Selection explanation + honest source message */}
          <div className={cn("rounded-xl border px-3 py-2", data.failureMode ? "border-rose-200 bg-rose-50/50" : data.flags.externalUsed ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50")}>
            <b>{data.flags.onlyOfficial ? "הערכת השווי מבוססת על עסקאות רשמיות בלבד." : data.flags.externalUsed ? "הערכת השווי כוללת מודעות חיצוניות אמיתיות שנמצאו במערכת." : (data.failureMode ? "אין ראיות מספיקות" : "נבחרו השוואות")}</b>
            <div className="text-muted mt-0.5 text-[11px]">{data.selectionExplanation}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Mini label="נסרקו (סה״כ)" value={fmt(data.totals.rawScanned)} />
            <Mini label="מועמדים" value={fmt(data.totals.candidates)} />
            <Mini label="כפילויות הוסרו" value={fmt(data.totals.duplicatesRemoved)} />
            <Mini label="עקיבים" value={fmt(data.totals.traceable)} />
            <Mini label="נבחרו" value={fmt(data.totals.selected)} tone="green" />
            <Mini label="חזקות" value={fmt(data.totals.strongSelected)} tone="green" />
          </div>

          {/* Per-source scan proof (every source, every time) */}
          <div className="overflow-x-auto">
            <b>הוכחת סריקה לכל מקור:</b>
            <table className="mt-1 w-full text-[11px]">
              <thead className="text-muted"><tr><th className="text-right">מקור</th><th>זמן</th><th>גולמי</th><th>עיר</th><th>מנורמל</th><th>≤1ק״מ</th><th>≤3ק״מ</th><th>מחיר+שטח</th><th>שמיש</th><th>נדחו</th></tr></thead>
              <tbody>
                {data.sourceStats.map((s, i) => (
                  <tr key={i} className="border-line border-b">
                    <td className="py-1 font-bold">{SRC_HE[s.source] ?? s.source}{!s.wired && <span className="text-amber-600"> (לא מחובר)</span>}</td>
                    <td className="text-center tabular-nums">{fmt(s.durationMs)}ms</td>
                    <td className="text-center tabular-nums">{s.error ? <span className="text-rose-700" title={s.error}>שגיאה</span> : fmt(s.rawRowsScanned)}</td>
                    <td className="text-center tabular-nums">{fmt(s.cityMatch)}</td>
                    <td className="text-center tabular-nums">{fmt(s.normalizedCityMatch)}</td>
                    <td className="text-center tabular-nums">{fmt(s.within1km)}</td>
                    <td className="text-center tabular-nums">{fmt(s.within3km)}</td>
                    <td className="text-center tabular-nums">{fmt(s.withPriceAndSqm)}</td>
                    <td className="text-center tabular-nums font-bold">{fmt(s.usableRows)}</td>
                    <td className="text-center tabular-nums">{fmt(s.rejectedRows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-muted">
            רדיוס מרבי בשימוש: <b>{(data.maxRadiusUsedM / 1000).toLocaleString("he-IL")} ק״מ</b>{data.expandedBeyondDefault ? " (הורחב)" : ""} ·
            כל המקורות נסרקו: <b>{data.flags.everySourceScanned ? "כן" : "לא"}</b> ·
            מודעות חיצוניות נסרקו: <b>{data.flags.externalScanned ? "כן" : "לא"}</b> ·
            משך כולל: <b>{fmt(data.timings.totalMs)}ms</b>
          </div>
          {/* Radius ladder */}
          <div className="text-muted"><b>ספירת רדיוס:</b> {data.radiusStats.map((r) => `${(r.radiusM / 1000).toLocaleString("he-IL")}ק״מ: ${fmt(r.usable)}/${fmt(r.found)}`).join(" · ")}</div>
        </div>
      )}
    </details>
  );
}

// ── VAL-QA-10 — External Listings Scan Proof panel (honest enforcement) ──────
const SCAN_CLASS_HE: Record<ExternalScanClassification, { label: string; tone: "green" | "amber" | "red" }> = {
  EXTERNAL_LISTINGS_OK: { label: "מודעות חיצוניות נסרקו ונמצאו שמישות", tone: "green" },
  NO_EXTERNAL_LISTINGS_IMPORTED: { label: "לא יובאו מודעות חיצוניות", tone: "amber" },
  EXTERNAL_PROVIDER_NOT_READING_TABLE: { label: "הספק אינו קורא את הטבלה", tone: "red" },
  EXTERNAL_CITY_FILTER_MISMATCH: { label: "אי-התאמת עיר/רדיוס", tone: "amber" },
  EXTERNAL_MISSING_PRICE_OR_SQM: { label: "חסר מחיר/שטח", tone: "amber" },
  EXTERNAL_COMPARABLES_NOT_USED: { label: "מודעות שמישות שלא נוצלו", tone: "red" },
};

function ScanProofPanel({ valuationId }: { valuationId: string }) {
  const [data, setData] = useState<ValuationScanProof | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setPending(true); setErr(null);
    try { const r = await getValuationScanProofAction(valuationId); if (r.ok) setData(r.data); else setErr(r.error); }
    catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setPending(false); }
  };

  const f = data?.external;
  const cls = data ? SCAN_CLASS_HE[data.classification] : null;
  const toneCol = cls?.tone === "green" ? "text-emerald-700" : cls?.tone === "red" ? "text-rose-700" : "text-amber-700";
  const toneBg = cls?.tone === "green" ? "border-emerald-200 bg-emerald-50/50" : cls?.tone === "red" ? "border-rose-200 bg-rose-50/50" : "border-amber-200 bg-amber-50/50";

  return (
    <details className="border-line bg-card rounded-2xl border p-4">
      <summary className="flex cursor-pointer items-center justify-between">
        <span className="text-ink text-sm font-black">🧾 הוכחת סריקת מודעות חיצוניות (VAL-QA-10)</span>
        <button onClick={(e) => { e.preventDefault(); run(); }} disabled={pending} className="bg-ink rounded-lg px-3 py-1 text-xs font-bold text-white disabled:opacity-60">{pending ? "בודק…" : "הרץ הוכחה"}</button>
      </summary>
      {err && <p className="mt-2 font-semibold text-rose-700">{err}</p>}
      {data && f && (
        <div className="mt-3 flex flex-col gap-3 text-[12px]">
          {/* Honest verdict banner (Part 4 enforcement) */}
          <div className={cn("rounded-xl border px-3 py-2", toneBg)}>
            {!data.externalScanned
              ? <b className="text-rose-700">המערכת לא סרקה מודעות חיצוניות — יש לבדוק חיבור מקור.</b>
              : <span><b className={toneCol}>{cls?.label}</b> — {data.reasonHe}</span>}
            <div className="text-muted mt-0.5 text-[11px]">סיווג: {data.classification} · נסרקו ע״י הספק: {fmt(data.externalProvider.rawRowsRead)} · שמישות אצל הספק: {fmt(data.externalProvider.usableRows)} · שולבו בהערכה: {fmt(data.externalUsedInValuation)}</div>
          </div>

          {/* Full external funnel (Core requirement) */}
          <div className="overflow-x-auto">
            <b>משפך external_listings:</b>
            <table className="mt-1 w-full text-[11px]">
              <tbody>
                {[
                  ["שורות גולמיות בארגון", f.rawRowsInOrg],
                  ["בעיר מדויקת", f.rowsAfterExactCity],
                  ["בעיר מנורמלת", f.rowsAfterNormalizedCity],
                  ["עם מחיר", f.rowsAfterPrice],
                  ["עם שטח (מ״ר)", f.rowsAfterSqm],
                  ["עם מחיר+שטח", f.rowsAfterPriceAndSqm],
                  ["תואם סוג נכס", f.rowsAfterType],
                  ["בטווח חדרים (±1)", f.rowsAfterRooms],
                  ["בטווח שטח (±25%)", f.rowsAfterArea],
                  ["ברדיוס 4 ק״מ", f.rowsAfterRadius],
                  ["שמישות (מיקום+מחיר+שטח)", f.usableRows],
                  ["נדחו", f.rejectedRows],
                ].map(([label, val], i) => (
                  <tr key={i} className="border-line border-b">
                    <td className="py-1 font-bold">{label}</td>
                    <td className="text-left tabular-nums">{fmt(Number(val))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {f.rejectionReasons.length > 0 && (
            <div className="text-muted"><b>סיבות דחייה:</b> {f.rejectionReasons.map((r) => `${r.reason} (${fmt(r.count)})`).join(" · ")}</div>
          )}
          {f.rowsAfterNormalizedCity === 0 && f.rawRowsInOrg > 0 && f.distinctCities.length > 0 && (
            <div className="text-muted"><b>ערים במודעות שקיימות:</b> {f.distinctCities.slice(0, 12).join(" · ")}</div>
          )}

          {/* Per-provider timing + counters (Part 1) */}
          <div className="overflow-x-auto">
            <b>תזמון וספירת ספקים:</b>
            <table className="mt-1 w-full text-[11px]">
              <thead className="text-muted"><tr><th className="text-right">ספק</th><th>טבלה</th><th>זמן (ms)</th><th>גולמי</th><th>שמיש</th><th>סטטוס</th></tr></thead>
              <tbody>
                {data.timings.map((t, i) => (
                  <tr key={i} className="border-line border-b">
                    <td className="py-1 font-bold">{t.provider}</td>
                    <td className="text-muted">{t.table}</td>
                    <td className="text-center tabular-nums">{fmt(t.durationMs)}</td>
                    <td className="text-center tabular-nums">{fmt(t.rawRowsRead)}</td>
                    <td className="text-center tabular-nums">{fmt(t.usableRows)}</td>
                    <td className="text-center">{t.status === "error" ? <span className="text-rose-700" title={t.message ?? ""}>שגיאה</span> : t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.notes.length > 0 && <ul className="text-muted list-disc pr-5">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
    </details>
  );
}

// ── Read-only evidence diagnostic panel (no writes; proves data-gap vs mismatch) ─
const CONCLUSION_HE: Record<ValuationEvidenceDiagnosis["conclusion"], string> = {
  DATA_GAP: "פער נתונים אמיתי — אין עסקאות/מודעות לאזור",
  CITY_NORMALIZATION_MISMATCH: "אי-התאמת שם עיר — קיימים נתונים תחת איות שונה",
  ADDRESS_RESOLUTION_MISMATCH: "אי-התאמת כתובת — קיימים נתונים סמוכים/באיות שונה שמסנן העיר מחריג",
  MISSING_PRICE_OR_SQM: 'קיימות שורות אך ללא מחיר/שטח שמיש',
  PROVIDER_NOT_WIRED: "תקלת ספק/חיווט — הנתונים קיימים אך הספק לא קורא אותם",
  UNKNOWN: "לא ודאי — ראה הערות",
};

function EvidenceSearchPanel({ valuationId }: { valuationId: string }) {
  const [data, setData] = useState<EvidencePackage | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nearby, setNearby] = useState(false);

  const run = async () => {
    setPending(true); setErr(null);
    try { const r = await getValuationEvidenceSearchAction(valuationId, nearby); if (r.ok) setData(r.data); else setErr(r.error); }
    catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setPending(false); }
  };

  return (
    <details className="border-line bg-card mt-4 rounded-card border p-4 text-sm">
      <summary className="text-muted cursor-pointer font-bold">🔍 Evidence Search™ (חיפוש ראיות מתקדם · קריאה בלבד)</summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={run} disabled={pending} className="btn-zono-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-bold disabled:opacity-60">{pending ? "מחפש…" : "הרץ חיפוש ראיות"}</button>
          <label className="text-muted flex items-center gap-1.5 text-[12px] font-bold"><input type="checkbox" checked={nearby} onChange={(e) => setNearby(e.target.checked)} /> כלול ערים סמוכות (ראיה חלשה)</label>
        </div>
        {err && <p className="font-semibold text-red-600">{err}</p>}
        {data && (
          <div className="flex flex-col gap-3 text-[12px]">
            <div className="text-muted border-line bg-surface rounded-lg border px-3 py-2">
              <b>כתובת מנורמלת:</b> {data.resolvedAddress.city ?? "—"}{data.resolvedAddress.neighborhood ? ` · ${data.resolvedAddress.neighborhood}` : ""}{data.resolvedAddress.street ? ` · ${data.resolvedAddress.street}` : ""} · קואורד׳: {data.coordinatesStatus === "present" ? "יש" : "אין"} · ערים סמוכות: {data.allowNearbyCities ? "מופעל" : "כבוי"}
            </div>
            <div className={cn("rounded-lg border px-3 py-2 font-bold", data.failureMode ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
              {data.failureMode ? `מצב: ${FAILURE_MODE_HE[data.failureMode]} · צעד מומלץ: ${data.recommendedNextStep}` : `✓ נמצאו ${data.counts.usable} ראיות שמישות להערכה`}
            </div>
            <div><b>רמות קרבה בשימוש:</b> {data.matchLevelsUsed.length ? data.matchLevelsUsed.map((l) => MATCH_LEVEL_HE[l]).join(" · ") : "—"}</div>

            {/* ── Market Radius Comparable Search™ (VAL-QA-9) ───────────────── */}
            <div className="rounded-lg border border-line bg-surface px-3 py-2 space-y-1">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                <span><b>מצב רדיוס שוק:</b> {RADIUS_MODE_HE[data.radius.mode]}</span>
                <span><b>רדיוס מקסימלי בשימוש:</b> {data.radius.maxRadiusUsedM > 0 ? `${(data.radius.maxRadiusUsedM / 1000).toLocaleString("he-IL")} ק״מ` : "ללא רדיוס (התאמת טקסט)"}</span>
                <span><b>ראיות חזקות:</b> {data.radius.strongUsable}/{data.radius.totalUsable}</span>
              </div>
              <div className="text-muted">
                <b>ספירה לפי רדיוס:</b>{" "}
                {data.radius.perLevel.length
                  ? data.radius.perLevel.map((p) => `${MATCH_LEVEL_HE[p.level]}: ${p.usable}/${p.found}`).join(" · ")
                  : "—"}
              </div>
              {data.radius.expandedBeyondDefault && (
                <div className="text-amber-700">
                  המערכת הרחיבה את החיפוש לרדיוס {(data.radius.maxRadiusUsedM / 1000).toLocaleString("he-IL")} ק״מ כי לא נמצאו מספיק ראיות קרובות.
                </div>
              )}
              {data.radius.weakDueToDistance && (
                <div className="font-bold text-rose-700">
                  ⚠ אזהרה: הראיות מבוססות בעיקר על נכסים מרוחקים — ודאו את רלוונטיותם לפני הסתמכות.
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted text-[11px]"><tr><th className="text-right">מקור</th><th>חובר</th><th>גולמי</th><th>שמיש</th><th>מתומחר</th><th>עיר מדויקת</th><th>עיר מנורמלת</th><th>רדיוס</th><th>נדחו</th></tr></thead>
                <tbody>
                  {data.sources.map((src) => (
                    <tr key={src.source} className="border-line border-b">
                      <td className="py-1.5 font-bold">{src.source}{!src.wired && <span className="text-amber-600"> (לא מחובר)</span>}</td>
                      <td className="text-center">{src.error ? <span className="text-red-600" title={src.error}>שגיאה</span> : "✓"}</td>
                      <td className="text-center tabular-nums">{src.rawCount}</td>
                      <td className="text-center tabular-nums">{src.usableCount}</td>
                      <td className="text-center tabular-nums">{src.pricedCount}</td>
                      <td className="text-center tabular-nums">{src.exactCityCount}</td>
                      <td className="text-center tabular-nums">{src.normalizedCityCount}</td>
                      <td className="text-center tabular-nums">{src.radiusCount ?? "—"}</td>
                      <td className="text-center tabular-nums">{src.rejectedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-muted">סה״כ {data.counts.totalRows} ראיות · {data.counts.usable} שמישות · {data.counts.sameCity} עיר מדויקת · {data.counts.normalizedCity} עיר מנורמלת · {data.counts.radius} ברדיוס · קומפרבלים להערכה: {data.comparablesForValuation.length}</div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <b>סיכום סריקת מקורות אמיתיים:</b>{" "}
              מודעות חיצוניות שנסרקו: {data.sources.find((x) => x.source === "external_listings")?.rawCount ?? 0} ·
              מודעות אמיתיות שמישות: {data.evidence.filter((e) => e.source === "external_listings" && e.usableForValuation).length} ·
              עסקאות רשמיות: {data.evidence.filter((e) => e.source === "property_transactions" && e.usableForValuation).length} ·
              נכסים פנימיים: {data.evidence.filter((e) => e.source === "properties" && e.usableForValuation).length} ·
              market_property_sources: {data.evidence.filter((e) => e.source === "market_property_sources" && e.usableForValuation).length} ·
              נדחו (לא עקיבים): {data.evidence.filter((e) => !e.isTraceable).length} ·
              רדיוס: {data.coordinatesStatus === "present" ? "זמין" : "לא זמין"} ·
              רמות קרבה: {data.matchLevelsUsed.length || "—"}
            </div>
            {/* Per-comparable traceability (anti-fake proof) */}
            <div className="overflow-x-auto">
              <b>עקיבות ראיות (הוכחה למקור אמיתי):</b>
              <table className="mt-1 w-full text-[11px]">
                <thead className="text-muted"><tr><th className="text-right">טבלת מקור</th><th>מזהה שורה</th><th>ספק</th><th>מודעה חיצונית</th><th>URL</th><th>תמונה</th><th>מחיר/מ״ר</th><th>שמיש</th><th>סיבת דחייה</th></tr></thead>
                <tbody>
                  {data.evidence.slice(0, 20).map((e, i) => (
                    <tr key={i} className={cn("border-line border-b", !e.isTraceable && "bg-rose-50/50")}>
                      <td className="py-1 font-bold">{e.sourceTable}</td>
                      <td className="max-w-[90px] truncate" title={e.externalId ?? ""}>{e.externalId ?? "—"}</td>
                      <td>{e.source}</td>
                      <td className="text-center">{e.sourceTable === "external_listings" || e.sourceTable === "market_property_sources" ? "✓" : "—"}</td>
                      <td className="text-center">{e.originalUrl && /^https?:\/\//.test(e.originalUrl) ? "✓" : "—"}</td>
                      <td className="text-center">{e.imageUrl ? "✓" : "—"}</td>
                      <td className="text-center">{(e.price ?? 0) > 0 && (e.sqm ?? 0) > 0 ? "✓" : "—"}</td>
                      <td className="text-center">{e.usableForValuation ? "✓" : "✗"}</td>
                      <td className="text-rose-700">{e.rejectionReason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function DiagSrcRow({ label, s }: { label: string; s: ValuationEvidenceDiagnosis["sources"]["propertyTransactions"] }) {
  return (
    <tr className="border-line border-b">
      <td className="py-1.5 font-bold">{label}</td>
      <td className="text-center tabular-nums">{s.exactCityCount}</td>
      <td className="text-center tabular-nums">{s.exactCityUsableCount}</td>
      <td className="text-center tabular-nums">{s.nearCityMatches}</td>
      <td className="text-center tabular-nums">{s.usableNearCityMatches}</td>
      <td className="text-center tabular-nums">{s.nearbyRadiusCount}</td>
      <td className="text-center tabular-nums">{s.usableNearbyRadiusCount}</td>
      <td className="text-center text-[11px]">{s.queryError ? <span className="text-red-600" title={s.queryError}>שגיאה</span> : s.rowsScanned}</td>
    </tr>
  );
}

function EvidenceDiagnostic({ valuationId }: { valuationId: string }) {
  const [data, setData] = useState<ValuationEvidenceDiagnosis | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setPending(true); setErr(null);
    try {
      const res = await diagnoseValuationEvidenceAction(valuationId);
      if (res.ok) setData(res.data); else setErr(res.error);
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setPending(false); }
  };

  return (
    <details className="border-line bg-card mt-8 rounded-card border p-4 text-sm">
      <summary className="text-muted cursor-pointer font-bold">🛠 אבחון ראיות (קריאה בלבד · QA)</summary>
      <div className="mt-3">
        <button onClick={run} disabled={pending} className="btn-zono-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-bold disabled:opacity-60">
          {pending ? "מאבחן…" : "הרץ אבחון"}
        </button>
        {err && <p className="mt-2 font-semibold text-red-600">{err}</p>}
        {data && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-bold text-amber-800">
              מסקנה: {CONCLUSION_HE[data.conclusion]} · צעד מומלץ: <code>{data.recommendedNextStep}</code>
            </div>
            <div className="text-muted text-[12px]">
              עיר: <b>{data.input.city ?? "—"}</b> (מנורמל: {data.input.cityNormalized || "—"}) · שכונה: {data.input.neighborhood ?? "—"} · חדרים: {data.input.rooms ?? "—"} · מ״ר: {data.input.sqm ?? "—"} · קואורד׳: {data.input.latitude != null && data.input.longitude != null ? "יש" : "אין"}
            </div>
            <div className="text-muted rounded-lg border border-line bg-surface px-3 py-2 text-[12px]">
              <b>כתובת:</b> {data.address.rawAddress ?? data.address.street ?? "—"}{data.address.houseNumber ? ` ${data.address.houseNumber}` : ""} · קואורד׳: {data.address.hasCoordinates ? `${data.address.latitude}, ${data.address.longitude}` : "אין"} · רדיוס: {data.address.matchability.canRadius ? "זמין" : "לא זמין"} · גיאוקוד: {data.address.geocodeSource ?? "—"}{data.address.geocodeConfidence != null ? ` (${data.address.geocodeConfidence})` : ""} · נכס מקושר: {data.address.linkedPropertyId ? "כן" : "לא"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted text-[11px]">
                  <tr><th className="text-right">מקור</th><th>עיר מדויקת</th><th>שמיש מדויק</th><th>עיר דומה</th><th>שמיש דומה</th><th>רדיוס</th><th>שמיש רדיוס</th><th>נסרקו</th></tr>
                </thead>
                <tbody>
                  <DiagSrcRow label="עסקאות (property_transactions)" s={data.sources.propertyTransactions} />
                  <DiagSrcRow label="מודעות (external_listings)" s={data.sources.externalListings} />
                  <DiagSrcRow label="מלאי פנימי (properties)" s={data.sources.properties} />
                  <DiagSrcRow label="מקורות שוק (market_property_sources)" s={data.sources.marketPropertySources} />
                </tbody>
              </table>
            </div>
            <div className="text-[12px]">
              <b>חיווט מקורות להערכה:</b>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.wiringMap.map((w) => (
                  <span key={w.table} className={cn("rounded-full px-2 py-0.5 font-bold", w.wired ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")} title={w.note}>
                    {w.source}: {w.wired ? "מחובר ✓" : "לא מחובר"}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-[12px]">
              <b>סטטוס ספקים:</b>{" "}
              {data.providerRun.map((p) => (
                <span key={p.source} className={cn("mr-1 inline-block rounded-full px-2 py-0.5 font-bold", p.status === "ok" ? "bg-emerald-50 text-emerald-700" : p.status === "error" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500")} title={p.message ?? ""}>
                  {p.source}: {p.status} ({p.usableCount})
                </span>
              ))}
              <span className="bg-slate-100 mr-1 inline-block rounded-full px-2 py-0.5 font-bold text-slate-600">broker_sold: {data.sources.brokerSold.usableCount}</span>
            </div>
            {data.cityNormalization.likelyCityMismatches.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[12px] text-orange-800">
                <b>איותי עיר חשודים (קיימים נתונים תחתיהם):</b> {data.cityNormalization.likelyCityMismatches.join(" · ")}
              </div>
            )}
            {data.notes.length > 0 && (
              <ul className="text-muted list-disc space-y-1 pr-5 text-[12px]">
                {data.notes.map((n, idx) => <li key={idx}>{n}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone: "brand" | "success" | "warning" }) {
  const ring = tone === "brand" ? "text-brand" : tone === "success" ? "text-emerald-600" : "text-amber-600";
  return (
    <div className="border-line bg-card rounded-card border p-5 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted text-sm font-bold">{label}</span>
        <Icon name={icon} size={18} className={ring} />
      </div>
      <p className="text-ink text-2xl font-black">{value}</p>
      {sub && <p className="text-muted mt-1 text-xs">{sub}</p>}
    </div>
  );
}

function FactorList({ title, tone, items }: { title: string; tone: "pos" | "neg"; items: ValuationRecord["adjustments"] }) {
  const color = tone === "pos" ? "text-emerald-600" : "text-red-600";
  return (
    <div>
      <p className={cn("mb-2 text-sm font-black", color)}>{title}</p>
      {items.length === 0 ? <p className="text-muted text-sm">—</p> : (
        <ul className="space-y-1.5">
          {items.map((a, idx) => (
            <li key={idx} className="border-line group relative flex items-center justify-between gap-2 border-b py-1.5 text-sm">
              <span className="text-ink flex items-center gap-1.5">
                {a.label}
                <span className="text-muted cursor-help" title={a.reason}><Icon name="Sparkles" size={12} /></span>
              </span>
              <b className={color}>{a.percentageImpact ? `${tone === "pos" ? "+" : "-"}${a.percentageImpact}%` : ils0(a.valueImpact)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WhatIf({ estimated, demand, recommended }: { estimated: number; demand: "low" | "medium" | "high"; recommended: number }) {
  const min = Math.round(estimated * 0.92 / 10000) * 10000;
  const max = Math.round(estimated * 1.16 / 10000) * 10000;
  const [price, setPrice] = useState(recommended || estimated);
  const wi = useMemo(() => computeWhatIf(price, estimated, demand), [price, estimated, demand]);
  return (
    <Section title='מה יקרה אם נפרסם במחיר…' icon="Target">
      <div className="border-line bg-card rounded-card border p-5 shadow-card">
        <div className="mb-2 text-center">
          <span className="bg-brand-soft text-brand-strong inline-block rounded-full px-4 py-1 text-lg font-black">{ils(price)}</span>
        </div>
        <input type="range" min={min} max={max} step={10000} value={price} onChange={(e) => setPrice(Number(e.target.value))}
          className="accent-brand h-2 w-full cursor-pointer" />
        <div className="text-muted mt-1 flex justify-between text-xs font-semibold"><span>{ils(min)}</span><span>{ils(max)}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Pulse label="סיכוי מכירה" value={`${wi.saleProbability}%`} accent />
          <Pulse label="ימים בשוק" value={`${Math.round(wi.daysOnMarket * 0.85)}–${wi.daysOnMarket}`} />
          <Pulse label="סיכון מו״מ" value={DEMAND_LABEL[wi.negotiationRisk]} />
          <Pulse label="ביקוש קונים" value={DEMAND_LABEL[wi.buyerDemand]} />
          <Pulse label="תחרות" value={DEMAND_LABEL[wi.competitionLevel]} />
        </div>
      </div>
    </Section>
  );
}

type Comp = ValuationRecord["comparables"][number];
type CompKind = "official" | "internal" | "external";
/** Classify a comparable by its REAL source table — never by a generic label. */
function compKind(c: Comp): CompKind {
  const t = c.sourceTable ?? null;
  if (t === "property_transactions" || c.source === "govmap" || c.source === "tax_authority") return "official";
  if (t === "external_listings" || t === "market_property_sources" || c.source === "madlan" || c.source === "yad2") return "external";
  return "internal"; // properties / deals / zono inventory
}
const KIND_BADGE: Record<CompKind, string> = { official: "עסקה רשמית", internal: "נכס פנימי", external: "מודעה" };
const isReal = (c: Comp) => c.isTraceable !== false && !!c.externalId && !!c.sourceTable;

function ComparablesSection({ record }: { record: ValuationRecord }) {
  // Only traceable comparables ever render (anti-fake, VAL-QA-6/8).
  const comps = record.comparables.filter(isReal);
  const external = comps.filter((c) => compKind(c) === "external");
  const officialInternal = comps.filter((c) => compKind(c) !== "external");
  const guard = comps.length === 0 ? null
    : external.length > 0 ? "הערכת השווי כוללת מודעות פעילות אמיתיות שנמצאו במערכת."
      : "הערכת השווי מבוססת על עסקאות רשמיות / נכסים פנימיים בלבד, לא על מודעות פעילות.";

  return (
    <>
      {guard && <p className="border-line bg-surface text-muted mt-6 rounded-xl border px-4 py-2 text-sm font-semibold">{guard}</p>}
      {officialInternal.length > 0 && (
        <Section title="עסקאות רשמיות ונכסים דומים" icon="Building2">
          <CompCarousel comps={officialInternal} />
        </Section>
      )}
      <Section title="מודעות חיצוניות דומות" icon="Megaphone">
        {external.length > 0
          ? <CompCarousel comps={external} />
          : <div className="border-line bg-card text-muted rounded-card border border-dashed p-8 text-center text-sm shadow-card">לא נמצאו מודעות חיצוניות אמיתיות להשוואה באזור.</div>}
      </Section>
    </>
  );
}

function CompCarousel({ comps }: { comps: Comp[] }) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {comps.slice(0, 16).map((c, idx) => <CompCard key={idx} c={c} />)}
    </div>
  );
}

function CompCard({ c }: { c: Comp }) {
  const kind = compKind(c);
  const realUrl = kind === "external" && c.originalUrl && /^https?:\/\//.test(c.originalUrl) ? c.originalUrl : null;
  return (
    <div className="border-line bg-card w-60 shrink-0 overflow-hidden rounded-card border shadow-card">
      <div className="relative h-28 w-full bg-line/40">
        {/* Real image only — never a fabricated property photo. */}
        {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="text-muted/70 grid h-full place-items-center gap-1 text-center"><Icon name="Building2" size={20} /><span className="text-[10px]">אין תמונה מקורית</span></div>}
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{SOURCE_LABEL[c.source] ?? c.source}</span>
        <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white", kind === "official" ? "bg-emerald-600" : kind === "internal" ? "bg-slate-600" : "bg-brand")}>{KIND_BADGE[kind]}</span>
      </div>
      <div className="p-3">
        <p className="text-ink truncate text-sm font-bold">{c.street || c.neighborhood || c.city || "—"}</p>
        <p className="text-brand-strong mt-0.5 text-lg font-black">{ils(c.price)}</p>
        <p className="text-muted text-xs">{c.pricePerSqm ? `${ils(c.pricePerSqm)} למ"ר` : ""}</p>
        <div className="text-muted mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {c.rooms != null && <span className="bg-line/50 rounded px-1.5 py-0.5">{c.rooms} חד׳</span>}
          {c.sqm != null && <span className="bg-line/50 rounded px-1.5 py-0.5">{c.sqm} {'מ"ר'}</span>}
          {c.floor != null && <span className="bg-line/50 rounded px-1.5 py-0.5">קומה {c.floor}</span>}
          {c.distanceMeters != null && <span className="bg-line/50 rounded px-1.5 py-0.5">{Math.round(c.distanceMeters)} {"מ'"}</span>}
        </div>
        {c.similarityScore != null && (
          <div className="mt-2">
            <div className="text-muted flex justify-between text-[10px] font-bold"><span>התאמה</span><span>{c.similarityScore}%</span></div>
            <div className="bg-line/50 mt-0.5 h-1 w-full overflow-hidden rounded-full"><div className="bg-brand h-1 rounded-full" style={{ width: `${c.similarityScore}%` }} /></div>
          </div>
        )}
        {/* "פתח מודעה" ONLY for a real external listing URL; everything else honest. */}
        <div className="mt-2 text-[11px]">
          {realUrl
            ? <a href={realUrl} target="_blank" rel="noreferrer" className="text-brand-strong font-bold hover:underline">פתח מודעה ↗</a>
            : <span className="text-muted/70">{kind === "official" ? "עסקה רשמית · ללא קישור ציבורי" : kind === "internal" ? "נכס פנימי · ללא קישור ציבורי" : "מודעה · אין קישור ציבורי"}</span>}
        </div>
      </div>
    </div>
  );
}

function BrokerSold({ record, onFollowup, busy }: { record: ValuationRecord; onFollowup: () => void; busy: boolean }) {
  const items = record.brokerSold;
  if (items.length === 0) {
    return (
      <Section title="נכסים שמכרתי באזור" icon="Handshake">
        <div className="border-line bg-card text-muted rounded-card border border-dashed p-8 text-center text-sm shadow-card">
          לא נמצאו עסקאות שלך באזור. ניתן עדיין להפיק דוח הערכת שווי מבוסס שוק.
        </div>
      </Section>
    );
  }
  const withPerf = items.filter((b) => b.performanceVsMarketPercent != null);
  const avgPerf = withPerf.length ? Math.round((withPerf.reduce((s, b) => s + (b.performanceVsMarketPercent ?? 0), 0) / withPerf.length) * 10) / 10 : null;
  return (
    <Section title="נכסים שמכרתי באזור" icon="Handshake" action={<button onClick={onFollowup} disabled={busy} className="text-brand text-sm font-bold disabled:opacity-50">צור מסע מוכר +</button>}>
      <p className="text-muted -mt-1 mb-3 text-sm">נמצאו {items.length} עסקאות שלך באזור.</p>
      {avgPerf != null && (
        <div className="mb-3 rounded-card border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-black text-emerald-700">אתה מוכר באזור הזה ב־{avgPerf > 0 ? "+" : ""}{avgPerf}% {avgPerf >= 0 ? "מעל" : "מתחת ל"}ממוצע השוק</p>
          <p className="mt-1 text-xs text-emerald-600">נתון זה יכול להופיע בדוח לבעל הנכס כדי לחזק את האמינות שלך.</p>
        </div>
      )}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.slice(0, 12).map((b, idx) => (
          <div key={idx} className="border-line bg-card w-56 shrink-0 overflow-hidden rounded-card border shadow-card">
            <div className="relative h-24 w-full bg-line/40">
              {b.imageUrl ? <img src={b.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-muted"><Icon name="Home" size={22} /></div>}
              <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">נמכר על ידך</span>
            </div>
            <div className="p-3">
              <p className="text-ink truncate text-sm font-bold">{b.address || b.neighborhood || "—"}</p>
              <p className="text-brand-strong mt-0.5 text-lg font-black">{ils(b.salePrice)}</p>
              <p className="text-muted text-xs">{b.pricePerSqm ? `${ils(b.pricePerSqm)} למ"ר` : ""} {b.saleDate ? `· ${b.saleDate}` : ""}</p>
              {b.performanceVsMarketPercent != null && (
                <p className={cn("mt-1 text-xs font-bold", b.performanceVsMarketPercent >= 0 ? "text-emerald-600" : "text-amber-600")}>
                  {b.performanceVsMarketPercent > 0 ? "+" : ""}{b.performanceVsMarketPercent}% מול השוק
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StrategyCard({ s }: { s: { key: StrategyKey; label: string; price: number; saleProbability: number; daysOnMarket: number; risk: string; recommended?: boolean } }) {
  return (
    <div className={cn("rounded-card border p-5 shadow-card", s.recommended ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-line bg-card")}>
      <div className="flex items-center justify-between">
        <p className="text-ink font-black">{STRATEGY_LABEL[s.key] ?? s.label}</p>
        {s.recommended && <span className="bg-brand rounded-full px-2 py-0.5 text-[11px] font-bold text-white">מומלץ</span>}
      </div>
      <p className="text-ink mt-2 text-2xl font-black">{ils(s.price)}</p>
      <div className="text-muted mt-3 space-y-1 text-xs">
        <p className="flex justify-between"><span>סיכוי מכירה</span><b className="text-ink">{s.saleProbability}%</b></p>
        <p className="flex justify-between"><span>ימים בשוק</span><b className="text-ink">~{s.daysOnMarket}</b></p>
        <p className="flex justify-between"><span>סיכון</span><b className="text-ink">{s.risk}</b></p>
      </div>
    </div>
  );
}

function Pulse({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3 text-center", accent ? "border-brand bg-brand-soft" : "border-line bg-card")}>
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className={cn("mt-1 text-base font-black", accent ? "text-brand-strong" : "text-ink")}>{value}</p>
    </div>
  );
}

function CTA({ icon, label, onClick, busy }: { icon: string; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="border-line bg-card text-ink inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold hover:shadow-lg disabled:opacity-60">
      <Icon name={icon} size={16} /> {label}
    </button>
  );
}

function SendModal({ valuationId, hasReport, onClose, onGenerated }: { valuationId: string; hasReport: boolean; onClose: () => void; onGenerated: (t: string) => void }) {
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("מצורף דוח הערכת שווי אינדיקטיבי לנכס.");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ handoffUrl: string | null } | null>(null);
  void hasReport;

  const send = async () => {
    setBusy(true); setErr(null);
    const res = await sendValuationReportAsPdfAction({
      valuationId, channel, recipientName: name || null,
      recipientPhone: channel === "whatsapp" ? phone || null : null,
      recipientEmail: channel === "email" ? email || null : null, message,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onGenerated(res.data.token);
    setDone({ handoffUrl: res.data.handoffUrl });
    if (res.data.handoffUrl && typeof window !== "undefined") window.open(res.data.handoffUrl, "_blank");
  };

  const cls = "border-line bg-card focus:border-brand focus:ring-brand/20 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-2";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div dir="rtl" className="bg-card w-full max-w-md rounded-[24px] border border-line p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-ink text-lg font-black">שלח דוח כ-PDF</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><Icon name="X" size={18} /></button>
        </div>

        {done ? (
          <div className="text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-600"><Icon name="Check" size={24} /></span>
            <p className="text-ink font-black">הדוח מוכן לשליחה</p>
            <p className="text-muted mt-1 text-sm">{done.handoffUrl ? "נפתח חלון שליחה — אשר ושלח דרך הערוץ." : "הדוח נשמר. הוסף נמען כדי לשלוח."}</p>
            {done.handoffUrl && <a href={done.handoffUrl} target="_blank" rel="noreferrer" className="btn-zono-primary zono-focus-ring mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold"><Icon name={channel === "whatsapp" ? "MessageCircle" : "Mail"} size={15} /> פתח שוב</a>}
            <button onClick={onClose} className="text-muted mt-3 block w-full text-sm font-bold">סגור</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(["whatsapp", "email"] as const).map((ch) => (
                <button key={ch} onClick={() => setChannel(ch)} className={cn("flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition",
                  channel === ch ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-card text-muted")}>
                  <Icon name={ch === "whatsapp" ? "MessageCircle" : "Mail"} size={16} /> {ch === "whatsapp" ? "וואטסאפ" : "מייל"}
                </button>
              ))}
            </div>
            <input className={cls} value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הנמען" />
            {channel === "whatsapp"
              ? <input className={cls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון (050…)" inputMode="tel" />
              : <input className={cls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל" inputMode="email" />}
            <textarea className={cn(cls, "min-h-20 resize-y")} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="הודעה קצרה" />
            {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
            <button onClick={send} disabled={busy} className="btn-zono-primary zono-focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-60">
              <Icon name="Send" size={16} /> {busy ? "מכין…" : "הכן ושלח"}
            </button>
            <p className="text-muted text-center text-[11px]">{VALUATION_DISCLAIMER}</p>
          </div>
        )}
      </div>
    </div>
  );
}
