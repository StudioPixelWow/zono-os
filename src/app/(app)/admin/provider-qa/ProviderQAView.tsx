"use client";
// ============================================================================
// ZONO Property Radar™ — Provider QA admin dashboard + manual QA screen (RTL).
// Provider Health cards (quality, latency, normalization failures, missing
// phones/images, duplicate rate, schema warnings) + a manual QA tool that
// shows raw payload, normalized payload, validation, quality score, errors.
// ============================================================================
import { useState } from "react";
import { Activity, AlertTriangle, ShieldCheck, PlayCircle, Loader2 } from "lucide-react";
import {
  runManualProviderQAAction,
  type ManualProviderQAResult,
  type ProviderQADashboard,
} from "@/lib/property-radar/provider-qa/actions";
import type { PropertyProviderName } from "@/lib/property-radar/types";

const PROVIDER_LABEL: Record<string, string> = { mock: "בדיקה (Mock)", yad2: "יד2", madlan: "מדלן" };
const STATUS_LABEL: Record<string, string> = { ok: "תקין", warning: "אזהרה", degraded: "ירוד" };
const STATUS_TONE: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  degraded: "bg-red-100 text-red-700",
};
const SEV_TONE: Record<string, string> = {
  low: "bg-black/5 text-ink/60", medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700",
};

function pct(n: number) { return `${Math.round(n)}`; }

export function ProviderQAView({ initial }: { initial: ProviderQADashboard }) {
  const [provider, setProvider] = useState<PropertyProviderName>("mock");
  const [city, setCity] = useState("חיפה");
  const [pending, setPending] = useState(false);
  const [manual, setManual] = useState<ManualProviderQAResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runManual() {
    setPending(true); setError(null); setManual(null);
    const res = await runManualProviderQAAction(provider, city, 10);
    if (res.ok) setManual(res.data); else setError(res.error);
    setPending(false);
  }

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-5 p-4">
      <header className="flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-soft text-brand-strong"><ShieldCheck size={20} /></span>
        <div>
          <h1 className="text-xl font-black text-ink">בקרת איכות ספקים</h1>
          <p className="text-sm text-ink/60">תקינות נתוני Yad2 / Madlan, זיהוי שינויי מבנה, ואיכות נורמליזציה.</p>
        </div>
      </header>

      {/* Provider Health */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-ink"><Activity size={16} /> בריאות ספקים</h2>
        {initial.metrics.length === 0 ? (
          <p className="rounded-xl bg-black/5 px-3 py-2 text-sm font-medium text-ink/60">עדיין אין נתוני QA. הרענון נצבר אוטומטית אחרי כל סריקת ספק.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {initial.metrics.map((m) => (
              <div key={`${m.provider}-${m.day}`} className="rounded-2xl border border-black/5 bg-brand-soft/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-black text-ink">{PROVIDER_LABEL[m.provider] ?? m.provider}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[m.status] ?? STATUS_TONE.ok}`}>{STATUS_LABEL[m.status] ?? m.status}</span>
                </div>
                <p className="mt-1 text-3xl font-black text-brand-strong">{pct(m.avg_quality_score)}<span className="text-base text-ink/40">/100</span></p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] font-semibold text-ink/70">
                  <span>זמן תגובה: {pct(m.avg_latency_ms)}ms</span>
                  <span>שלמות שדות: {pct(m.avg_fields_completeness)}%</span>
                  <span>נסרקו: {m.listings_scanned}</span>
                  <span>נדחו: {m.listings_rejected}</span>
                  <span>כשלי נורמליזציה: {m.normalization_errors}</span>
                  <span>חסרי טלפון: {m.missing_phones}</span>
                  <span>חסרי תמונה: {m.missing_images}</span>
                  <span>שכפולים: {pct(m.duplicate_rate)}%</span>
                  <span>אזהרות מבנה: {m.schema_warnings}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Schema warnings */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-ink"><AlertTriangle size={16} /> שינויי מבנה ואזהרות אחרונות</h2>
        {initial.schemaEvents.length === 0 ? (
          <p className="rounded-xl bg-black/5 px-3 py-2 text-sm font-medium text-ink/60">לא זוהו שינויי מבנה.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {initial.schemaEvents.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2 text-xs">
                <span className={`rounded-md px-2 py-0.5 font-bold ${SEV_TONE[e.severity] ?? SEV_TONE.low}`}>{e.severity}</span>
                <span className="font-bold text-ink">{PROVIDER_LABEL[e.provider] ?? e.provider}</span>
                <span className="font-mono text-ink/70">{e.field}</span>
                <span className="text-ink/50">{e.previous_type ?? "—"} → {e.new_type ?? "—"}</span>
                <span className="mr-auto text-ink/45">{new Date(e.detected_at).toLocaleString("he-IL")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Manual QA */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-ink"><PlayCircle size={16} /> בדיקת QA ידנית</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-ink/60">ספק
            <select value={provider} onChange={(e) => setProvider(e.target.value as PropertyProviderName)} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-ink">
              <option value="mock">בדיקה (Mock)</option>
              <option value="yad2">יד2</option>
              <option value="madlan">מדלן</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-ink/60">עיר
            <input value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-ink" />
          </label>
          <button type="button" onClick={runManual} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-black text-white disabled:opacity-60">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />} הרץ בדיקה
          </button>
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

        {manual && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-soft/30 p-3 text-sm font-bold">
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[manual.batch.status]}`}>{STATUS_LABEL[manual.batch.status]}</span>
              <span className="text-brand-strong">ציון איכות ממוצע: {pct(manual.batch.statistics.avgQualityScore)}/100</span>
              <span className="text-ink/60">נסרקו {manual.batch.statistics.scanned} · נדחו {manual.batch.statistics.rejected} · שכפולים {manual.batch.statistics.duplicateCount}</span>
            </div>
            {manual.reports.map((r, i) => (
              <details key={i} className="rounded-2xl border border-black/5 bg-white p-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${r.accepted ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{r.accepted ? "התקבל" : "נדחה"}</span>
                  <span className="font-mono text-ink/70">{r.externalId ?? "—"}</span>
                  <span className="mr-auto text-brand-strong">ציון {pct(r.normalization.qualityScore)}</span>
                </summary>
                <div className="mt-2 grid gap-2 text-[12px] sm:grid-cols-2">
                  <div>
                    <p className="mb-1 font-black text-ink/70">ולידציה</p>
                    {r.field.missingRequired.length > 0 && <p className="text-red-600">חסרים חובה: {r.field.missingRequired.join(", ")}</p>}
                    {r.field.missingOptional.length > 0 && <p className="text-ink/50">חסרים אופציונליים: {r.field.missingOptional.join(", ")}</p>}
                    {r.normalization.issues.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {r.normalization.issues.map((iss, j) => <li key={j} className="text-amber-700">• {iss.message} (−{iss.penalty})</li>)}
                      </ul>
                    ) : <p className="text-emerald-600">אין בעיות נורמליזציה</p>}
                  </div>
                  <div>
                    <p className="mb-1 font-black text-ink/70">נתון מנורמל</p>
                    <pre dir="ltr" className="max-h-44 overflow-auto rounded-lg bg-black/[0.04] p-2 text-[11px] text-ink/80">{JSON.stringify(r.normalizedPayload, null, 1)}</pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
