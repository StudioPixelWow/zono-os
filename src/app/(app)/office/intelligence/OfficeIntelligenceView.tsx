"use client";
// ============================================================================
// ZONO — Office Intelligence view (client). Insight-FIRST, editorial layout: a hero
// takeaway, then ≤6 explainable modules (funnel, lead-source, response-time, deal
// bottlenecks, property demand, inventory gap), each with a plain-language reading
// and a simple supporting bar (no chart library, no gauges, no decoration). Every
// insight shows its evidence + honest confidence and deep-links into the engine that
// owns the fix. Learning state for new offices. Desktop uses width; mobile stacks.
// RTL. Records product usage only (no surveillance).
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { recordUsageAction } from "@/lib/launch/server/actions";
import { CONFIDENCE_LABEL, type Insight } from "@/lib/office/intelligence-core";
import type { OfficeIntelligence } from "@/lib/office/office-intelligence";

const CONF_TONE: Record<string, string> = { strong: "bg-success-soft text-success", moderate: "bg-warning-soft text-warning", insufficient_data: "bg-surface text-muted" };
const PERIODS = [7, 30, 90] as const;

function track(name: string, props?: Record<string, string | number | boolean>) { void recordUsageAction({ category: "feature", name, props }); }

function Bar({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted w-28 shrink-0 truncate text-xs">{label}</span>
      <div className="bg-surface h-6 flex-1 overflow-hidden rounded-lg"><div className="bg-brand h-full rounded-lg" style={{ width: `${pct}%` }} /></div>
      <span className="text-ink w-16 shrink-0 text-left text-xs font-bold">{sub ?? value}</span>
    </div>
  );
}

function ConfidenceChip({ c }: { c: Insight["confidence"] }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CONF_TONE[c]}`}>{CONFIDENCE_LABEL[c]}</span>;
}

function InsightCard({ i }: { i: Insight }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-ink text-base font-extrabold">{i.title}</p>
        <ConfidenceChip c={i.confidence} />
      </div>
      <p className="text-muted text-sm">{i.explanation}</p>
      {i.evidence.length > 0 && (
        <ul className="text-muted mt-3 flex flex-col gap-1 text-xs">
          {i.evidence.slice(0, 6).map((e, idx) => <li key={idx} className="flex items-center gap-2"><span className="bg-brand/40 h-1 w-1 rounded-full" />{e}</li>)}
        </ul>
      )}
      {i.route && i.actionLabel && (
        <Link href={i.route} onClick={() => track("office_insight_opened", { type: i.type })} className="text-brand mt-3 inline-block text-sm font-bold hover:underline">{i.actionLabel} ←</Link>
      )}
    </div>
  );
}

export function OfficeIntelligenceView({ intel }: { intel: OfficeIntelligence }) {
  const funnelMax = Math.max(1, ...intel.funnel.map((f) => f.count));
  const sourceMax = Math.max(1, ...intel.leadSources.map((s) => s.leads));
  const rtMax = Math.max(1, ...intel.responseTime.bands.map((b) => b.leads));
  const stageMax = Math.max(1, ...intel.dealStages.map((s) => s.medianDays ?? 0));
  const secondary = intel.insights.filter((i) => i.id !== intel.hero?.id && i.confidence !== "insufficient_data");

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
      {/* Header + tabs + period */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="border-line mb-2 inline-flex items-center gap-1 rounded-2xl border p-1 text-sm font-bold">
            <Link href="/office" className="text-muted rounded-xl px-4 py-2 hover:bg-surface">המשרד</Link>
            <span className="bg-brand rounded-xl px-4 py-2 text-white">תובנות</span>
          </div>
          <h1 className="text-ink text-2xl font-black">תובנות על המשרד</h1>
        </div>
        <div className="border-line inline-flex items-center gap-1 self-start rounded-2xl border p-1 text-sm font-bold">
          {PERIODS.map((p) => (
            <Link key={p} href={`/office/intelligence?period=${p}`} onClick={() => track("office_intelligence_period_changed", { period: p })}
              className={`rounded-xl px-3 py-1.5 ${intel.period.days === p ? "bg-brand text-white" : "text-muted hover:bg-surface"}`}>{p} ימים</Link>
          ))}
        </div>
      </div>

      {/* Learning state */}
      {intel.learning ? (
        <div className="bg-card border-line rounded-[24px] border p-8 text-center">
          <div className="text-4xl">🌱</div>
          <p className="text-ink mt-3 text-lg font-black">ZONO עדיין לומדת את הפעילות במשרד</p>
          <p className="text-muted mx-auto mt-2 max-w-md text-sm">כשיצטברו יותר לידים, עסקאות ונכסים, כאן יופיעו תובנות מבוססות: משפך המרות, איכות מקורות לידים, דפוסי זמן מענה, צווארי בקבוק בעסקאות והזדמנויות מלאי. מרכז השליטה ממשיך לעבוד כרגיל.</p>
          <Link href="/office" className="bg-brand mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-extrabold text-white">חזרה למרכז השליטה</Link>
        </div>
      ) : (
        <>
          {/* Hero insight */}
          {intel.hero && (
            <div className="bg-brand text-white rounded-[24px] p-6">
              <p className="text-xs font-bold opacity-80">הדבר המרכזי שכדאי לדעת</p>
              <p className="mt-1 text-xl font-black">{intel.hero.title}</p>
              <p className="mt-1 text-sm opacity-90">{intel.hero.explanation}</p>
              {intel.hero.route && intel.hero.actionLabel && (
                <Link href={intel.hero.route} onClick={() => track("office_insight_opened", { type: intel.hero!.type, hero: true })} className="text-brand mt-3 inline-block rounded-xl bg-white px-4 py-2 text-sm font-extrabold">{intel.hero.actionLabel}</Link>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Funnel */}
            <Module title="משפך המשרד" hint="ספירת שלבים והמרה ביניהם (מבוסס שלבי ליד אמיתיים)">
              <div className="flex flex-col gap-2">
                {intel.funnel.map((f) => <Bar key={f.key} label={f.label} value={f.count} max={funnelMax} sub={`${f.count}${f.conversionFromPrev != null ? ` · ${f.conversionFromPrev}%` : ""}`} />)}
              </div>
            </Module>

            {/* Lead sources */}
            {intel.leadSources.length > 0 && (
              <Module title="איכות מקורות לידים" hint="לידים והתקדמותם לפי מקור — לא 'הכי טוב' לפי כמות בלבד">
                <div className="flex flex-col gap-2">
                  {intel.leadSources.slice(0, 6).map((s) => <Bar key={s.source} label={s.label} value={s.leads} max={sourceMax} sub={`${s.leads} · ${s.progressionShare ?? "—"}%`} />)}
                </div>
              </Module>
            )}

            {/* Response time */}
            {intel.responseTime.bands.length > 0 && (
              <Module title="זמן מענה מול התקדמות" hint="שיעור ההתקדמות בכל תחום זמן — התאמה שנצפתה, לא סיבתיות">
                <div className="flex flex-col gap-2">
                  {intel.responseTime.bands.map((b) => <Bar key={b.band} label={b.band} value={b.leads} max={rtMax} sub={`${b.progressionRate ?? "—"}%`} />)}
                </div>
                {intel.responseTime.confidence === "insufficient_data" && <p className="text-muted mt-2 text-xs">אין עדיין מספיק נתונים על מגע ראשון מתועד.</p>}
              </Module>
            )}

            {/* Deal stage durations */}
            {intel.dealStages.length > 0 && (
              <Module title="זמן שהייה בשלבי עסקה" hint="חציון ימים בכל שלב (deal_journeys)">
                <div className="flex flex-col gap-2">
                  {intel.dealStages.filter((s) => s.medianDays != null).slice(0, 8).map((s) => <Bar key={s.stage} label={s.label} value={s.medianDays ?? 0} max={stageMax} sub={`${s.medianDays} ימים`} />)}
                </div>
              </Module>
            )}
          </div>

          {/* Secondary insights */}
          {secondary.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {secondary.map((i) => <InsightCard key={i.id} i={i} />)}
            </div>
          )}

          {/* Property demand */}
          {intel.propertyDemand.highDemandLowProgression.length > 0 && (
            <Module title="נכסים עם עניין גבוה שלא מתקדמים" hint="הרבה התאמות/מתעניינים, מעט ביקורים">
              <ul className="flex flex-col gap-2">
                {intel.propertyDemand.highDemandLowProgression.slice(0, 6).map((p) => (
                  <li key={p.propertyId}><Link href={`/properties/${p.propertyId}`} onClick={() => track("office_insight_opened", { type: "property_demand" })} className="hover:bg-surface -mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-2">
                    <span className="text-ink truncate text-sm font-bold">{p.title}</span>
                    <span className="text-muted shrink-0 text-xs">{p.matches} התאמות · {p.interested} מתעניינים · {p.viewings} ביקורים</span>
                  </Link></li>
                ))}
              </ul>
            </Module>
          )}

          {/* Inventory gaps */}
          {intel.inventoryGaps.length > 0 && (
            <Module title="הזדמנויות מלאי" hint="ביקוש גבוה מול מלאי נמוך (מפת ביקוש אמיתית)">
              <ul className="flex flex-col gap-2">
                {intel.inventoryGaps.slice(0, 6).map((g, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink font-bold">{[g.roomsBucket, g.propertyType, g.area].filter(Boolean).join(" · ")}</span>
                    <span className="text-muted text-xs">{g.activeBuyers} קונים · {g.inventory} נכסים</span>
                  </li>
                ))}
              </ul>
            </Module>
          )}

          {/* Recommendations */}
          {intel.recommendations.length > 0 && (
            <div className="bg-card border-line rounded-[22px] border p-5">
              <p className="text-ink mb-3 text-sm font-black">מה הייתי בודק במשרד</p>
              <ul className="flex flex-col gap-2">
                {intel.recommendations.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink text-sm">{r.text}</span>
                    {r.route && r.actionLabel && <Link href={r.route} className="text-brand shrink-0 text-xs font-bold hover:underline">{r.actionLabel} ←</Link>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Data quality (subtle, manager-only) */}
          {intel.dataQuality.length > 0 && (
            <details className="text-muted text-xs">
              <summary className="cursor-pointer font-bold">הערות איכות נתונים</summary>
              <ul className="mt-2 flex flex-col gap-1">{intel.dataQuality.map((q, idx) => <li key={idx}>• {q}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Module({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border-line rounded-[20px] border p-5">
      <div className="mb-3">
        <h2 className="text-ink flex items-center gap-1.5 text-sm font-black"><Icon name="BarChart3" size={15} className="text-muted" />{title}</h2>
        <p className="text-muted text-xs">{hint}</p>
      </div>
      {children}
    </section>
  );
}
