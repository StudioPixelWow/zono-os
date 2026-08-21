// ============================================================================
// 🧭 מרכז מודיעין שוק — the Market Intelligence COCKPIT (server component).
// ----------------------------------------------------------------------------
// Hierarchy: MARKET → CHANGE → LOCATION → OPPORTUNITY → EVIDENCE → RAW DATA.
// A manager grasps the market state in ~10s: a dominant Pulse, one real primary
// chart, a ZONO brief (evidence-gated), geographic + neighbourhood comparison,
// Top-3 opportunities as decisions, then price distribution / listing-age /
// activity, a bounded feed and compact data quality. Presentation only — every
// number comes from the pure cockpit model; DATA_REQUIRED states are honest, and
// nothing (trend, demand, comparison) is fabricated.
// ============================================================================
import Link from "next/link";
import type { MarketCockpit, ZonoInsight, AreaGeo, NeighborhoodStat, Opportunity } from "@/lib/market-intelligence/command-center";
import {
  IntelligenceHeader, IntelligenceSection, IntelligenceEmptyState, IntelligenceEmptyInline,
} from "@/components/intelligence/framework";
import { StatusBadge } from "@/components/intelligence/terminal";
import { MarketFilterBar } from "./MarketFilterBar";
import { MarketPrimaryChart } from "./MarketPrimaryChart";

const nf = (n: number | null, p = ""): string => (n == null ? "—" : `${p}${Math.round(n).toLocaleString("he-IL")}`);
const ils = (n: number | null): string => (n == null || n <= 0 ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);

export function MarketCockpitView({ data }: { data: MarketCockpit }) {
  if (!data.hasData) {
    return (
      <div dir="rtl" className="flex flex-col gap-4">
        <IntelligenceHeader emoji="🧭" eyebrow="מודיעין שוק" title="מרכז מודיעין שוק" subtitle="סנכרון נתוני השוק החיצוני יזרים לכאן מודיעין חי." />
        <IntelligenceEmptyState title="עדיין אין נתוני שוק להצגה" steps={["סנכרן מודעות שוק ממקורות חיצוניים", "המתן להשלמת הסריקה והגאוקודינג", "חזור למרכז המודיעין"]} />
      </div>
    );
  }
  const d = data;
  const scopeLabel = d.filters.neighborhood || d.filters.city || "כל האזור";

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <IntelligenceHeader
        emoji="🧭" eyebrow="מודיעין שוק" title="מרכז מודיעין שוק"
        subtitle="מה קורה בשוק · מה השתנה · איפה מתחמם · איפה ההזדמנויות · מה כדאי לבדוק."
        status={<StatusBadge label={`ביטחון נתונים ${d.dataQuality.priceSqmPct}%`} tone={d.dataQuality.priceSqmPct >= 70 ? "rising" : d.dataQuality.priceSqmPct >= 40 ? "contender" : "warn"} />}
      />
      <MarketFilterBar facets={d.facets} filters={d.filters} />

      {/* ── MARKET: pulse (dominant) + KPI strip ────────────────────────────── */}
      <Pulse d={d} scopeLabel={scopeLabel} />

      {/* ── CHANGE: primary chart (2/3) + ZONO brief (1/3) ──────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <MarketPrimaryChart series={d.series} initialPeriod={d.filters.period} />
        <ZonoBrief insights={d.zonoInsights} />
      </div>

      {/* ── LOCATION: geographic activity + neighbourhood comparison ────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceSection title="איפה מתרחשת הפעילות" subtitle="ריכוז מלאי, מודעות חדשות וירידות מחיר לפי אזור" action={<Link href="/market-intelligence/map" prefetch={false} className="text-brand text-xs font-bold">מפה חיה ←</Link>}>
          <GeoAreas geo={d.geo} />
        </IntelligenceSection>
        <IntelligenceSection title="השוואת שכונות" subtitle="₪/מ״ר · מלאי · מתחת לשוק">
          <NeighborhoodCompare rows={d.neighborhoods} />
        </IntelligenceSection>
      </div>

      {/* ── OPPORTUNITY: Top-3 as decisions ─────────────────────────────────── */}
      <IntelligenceSection title="הזדמנויות מובילות" subtitle="נכסים שדורשים החלטה — מתחת למחיר השוק, בעלים פרטי, או ירידת מחיר" action={<Link href="/market-intelligence/listings" prefetch={false} className="text-brand text-xs font-bold">כל ההזדמנויות ({d.opportunitiesTotal}) ←</Link>}>
        {d.opportunities.length === 0
          ? <IntelligenceEmptyInline text="אין כרגע הזדמנויות מזוהות בטווח הנוכחי." />
          : <div className="grid gap-3 sm:grid-cols-3">{d.opportunities.map((o) => <OppCard key={o.id} o={o} />)}</div>}
      </IntelligenceSection>

      {/* ── EVIDENCE: price distribution · listing age · activity ───────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <IntelligenceSection title="פיזור מחירים" subtitle={`${d.priceHistogram.scopeCount} נכסים למכירה בטווח`}>
          <PriceHistogram h={d.priceHistogram} />
        </IntelligenceSection>
        <IntelligenceSection title="ותק מודעה בשוק" subtitle="זמן מאז שנצפתה לראשונה (לא זמן-למכירה)">
          <DomBuckets dom={d.dom} />
        </IntelligenceSection>
        <IntelligenceSection title="פעילות מול מלאי" subtitle="מודעות חדשות בטווח מול המלאי הנצפה">
          <Activity d={d} />
        </IntelligenceSection>
      </div>

      {/* ── RAW: live feed + data quality ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <IntelligenceSection title="פיד שוק חי" subtitle="המודעות החדשות ביותר">
          <div className="flex flex-col">
            {d.feed.map((f) => (
              <Link key={f.id} href={f.href} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-2 transition last:border-0">
                <span className="min-w-0"><span className="text-ink block truncate text-xs font-bold">{f.title}</span><span className="text-muted block truncate text-[11px]">{f.sub}</span></span>
                <span className="text-muted shrink-0 text-[10px]">{f.meta}</span>
              </Link>
            ))}
          </div>
        </IntelligenceSection>
        <IntelligenceSection title="איכות ומקורות הנתונים" subtitle="שקיפות על מה שנאסף">
          <DataQuality d={d} />
        </IntelligenceSection>
      </div>
    </div>
  );
}

// ── Pulse ──────────────────────────────────────────────────────────────────────
function Pulse({ d, scopeLabel }: { d: MarketCockpit; scopeLabel: string }) {
  const delta = (v: number | null) => v == null ? null : <span className={`ms-1 rounded px-1 py-0.5 text-[10px] font-bold ${v >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{v >= 0 ? "▲" : "▼"}{Math.abs(v)}%</span>;
  return (
    <section dir="rtl" className="border-line bg-card bg-gradient-to-bl from-brand-soft/50 to-transparent grid gap-4 rounded-2xl border p-4 sm:p-5 lg:grid-cols-[1.3fr_2fr]">
      <div>
        <p className="text-brand text-[11px] font-black tracking-wide">השוק עכשיו · {scopeLabel} · {d.pulse.periodDays} ימים</p>
        <p className="text-ink mt-1 text-lg font-black leading-snug sm:text-xl">{d.pulse.headline}</p>
        <p className="text-muted mt-1 text-xs">{d.scopedCount.toLocaleString("he-IL")} נכסים בטווח · {d.facets.neighborhoods.length} שכונות</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric big label="מודעות חדשות" value={nf(d.pulse.newThisPeriod)} extra={delta(d.pulse.newDeltaPct)} tone="text-brand-strong" />
        <Metric big label="ירידות מחיר" value={nf(d.pulse.reductionsThisPeriod)} extra={delta(d.pulse.reductionsDeltaPct)} tone="text-warning" />
        <Metric big label="הזדמנויות" value={nf(d.opportunitiesTotal)} tone="text-success" />
        <Metric big label="בעלים פרטי" value={nf(d.kpis.find((k) => k.key === "private")?.value ?? null)} tone="text-ink" />
      </div>
    </section>
  );
}
function Metric({ label, value, extra, tone = "text-ink", big }: { label: string; value: string; extra?: React.ReactNode; tone?: string; big?: boolean }) {
  return (
    <div className="border-line bg-card rounded-xl border p-3">
      <div className={`font-black tabular-nums ${big ? "text-2xl" : "text-xl"} ${tone}`}>{value}{extra}</div>
      <div className="text-muted mt-0.5 text-[11px] font-bold leading-tight">{label}</div>
    </div>
  );
}

// ── ZONO brief ──────────────────────────────────────────────────────────────────
function ZonoBrief({ insights }: { insights: ZonoInsight[] }) {
  return (
    <div className="border-line bg-card flex flex-col rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand text-white grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black">Z</span>
        <div><p className="text-ink text-sm font-black leading-tight">זונו זיהה</p><p className="text-muted text-[11px]">תובנות מבוססות-ראיות בלבד</p></div>
      </div>
      {insights.length === 0 ? (
        <div className="border-line text-muted grid flex-1 place-items-center rounded-xl border border-dashed p-4 text-center text-xs">אין כרגע חריגות משמעותיות בטווח הנוכחי. הכול נראה יציב.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((i) => (
            <Link key={i.id} href={i.href} prefetch={false} className="border-line hover:bg-surface block rounded-xl border p-3 transition">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${i.tone === "warning" ? "bg-warning" : i.tone === "success" ? "bg-success" : i.tone === "danger" ? "bg-danger" : "bg-brand"}`} />
                <div className="min-w-0">
                  <p className="text-ink text-xs font-black">{i.what}</p>
                  <p className="text-muted mt-0.5 text-[11px] leading-relaxed">{i.why}</p>
                  {i.action && <span className="text-brand-strong mt-1 inline-block text-[11px] font-bold">{i.action} ←</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Geographic areas (honest aggregation, not polygons) ─────────────────────────
function GeoAreas({ geo }: { geo: AreaGeo[] }) {
  const top = geo.slice(0, 6);
  const max = Math.max(1, ...top.map((g) => g.inventory));
  if (!top.length) return <IntelligenceEmptyInline text="אין נתוני אזורים." />;
  return (
    <div className="flex flex-col gap-2.5">
      {top.map((g) => (
        <div key={g.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-ink truncate font-bold">{g.name}</span>
            <span className="text-muted shrink-0 tabular-nums">{g.inventory} מלאי{g.reductions > 0 ? ` · ${g.reductions} ↓` : ""}{g.newInPeriod > 0 ? ` · +${g.newInPeriod} חדש` : ""}</span>
          </div>
          <div className="bg-surface h-1.5 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${(g.inventory / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

// ── Neighbourhood comparison ────────────────────────────────────────────────────
function NeighborhoodCompare({ rows }: { rows: NeighborhoodStat[] }) {
  const top = rows.slice(0, 5);
  const maxPps = Math.max(1, ...top.map((r) => r.avgPricePerSqm ?? 0));
  if (!top.length) return <IntelligenceEmptyInline text="אין נתוני שכונות." />;
  return (
    <div className="flex flex-col gap-3">
      {top.map((r) => (
        <div key={`${r.name}-${r.city ?? ""}`}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-ink truncate font-bold">{r.name}</span>
            <span className="text-muted shrink-0 tabular-nums">{ils(r.avgPricePerSqm)}/מ״ר · {r.inventory} מלאי{r.belowAvg > 0 ? ` · ${r.belowAvg} מתחת` : ""}</span>
          </div>
          <div className="bg-surface h-1.5 w-full overflow-hidden rounded-full"><div className="bg-brand-strong h-full rounded-full" style={{ width: `${((r.avgPricePerSqm ?? 0) / maxPps) * 100}%` }} /></div>
        </div>
      ))}
      {rows.length > 5 && (
        <details className="text-xs">
          <summary className="text-brand cursor-pointer font-bold">צפה בטבלה המלאה ({rows.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-right"><tbody>
              {rows.map((r) => (
                <tr key={`f-${r.name}`} className="border-line/60 border-b last:border-0">
                  <td className="text-ink py-1.5 font-bold">{r.name}</td>
                  <td className="text-muted py-1.5 tabular-nums">{ils(r.avgPricePerSqm)}/מ״ר</td>
                  <td className="text-muted py-1.5 tabular-nums">{r.inventory} מלאי</td>
                  <td className="py-1.5 tabular-nums">{r.privateOwner > 0 ? <span className="text-brand-strong">{r.privateOwner} פרטי</span> : "—"}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </details>
      )}
    </div>
  );
}

// ── Opportunity card ────────────────────────────────────────────────────────────
function OppCard({ o }: { o: Opportunity }) {
  return (
    <Link href={o.href} prefetch={false} className="border-line hover:border-brand-light hover:bg-surface group flex flex-col overflow-hidden rounded-xl border transition">
      <div className="bg-surface relative aspect-[4/3] overflow-hidden">
        {o.image ? <img src={o.image} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" /> : <span className="text-muted grid h-full place-items-center text-[11px]">אין תמונה</span>}
        {o.price != null && o.price > 0 && <span className="bg-card/90 text-ink absolute bottom-2 start-2 rounded-md px-2 py-0.5 text-xs font-black backdrop-blur">{ils(o.price)}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="text-ink line-clamp-1 text-sm font-black">{o.title}</span>
        {o.sub && <span className="text-muted line-clamp-1 text-[11px]">{o.sub}</span>}
        <span className="mt-auto flex flex-wrap gap-1 pt-1">
          {o.reasons.slice(0, 2).map((r, i) => <span key={i} className="bg-brand-soft text-brand-strong rounded-md px-1.5 py-0.5 text-[10px] font-bold">{r}</span>)}
        </span>
      </div>
    </Link>
  );
}

// ── Price histogram ─────────────────────────────────────────────────────────────
function PriceHistogram({ h }: { h: MarketCockpit["priceHistogram"] }) {
  if (h.status === "data_required") return <IntelligenceEmptyInline text={`נדרשים לפחות 20 נכסים מתומחרים בטווח (יש ${h.scopeCount}).`} />;
  const max = Math.max(1, ...h.bands.map((b) => b.count));
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {h.bands.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${ils(b.lo)}–${ils(b.hi)} · ${b.count}`}>
            <div className={`w-full rounded-t ${b.isMedianBand ? "bg-brand-strong" : "bg-brand/60"}`} style={{ height: `${(b.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <p className="text-muted mt-2 text-[10px]">חציון: {ils(h.median)} · העמודה הכהה = טווח החציון</p>
    </div>
  );
}

// ── Listing age ─────────────────────────────────────────────────────────────────
function DomBuckets({ dom }: { dom: MarketCockpit["dom"] }) {
  const max = Math.max(1, ...dom.buckets.map((b) => b.count));
  return (
    <div className="flex flex-col gap-2">
      {dom.buckets.map((b) => (
        <div key={b.key}>
          <div className="text-muted mb-1 flex justify-between text-xs font-bold"><span>{b.label}</span><span className="text-ink tabular-nums">{b.count}</span></div>
          <div className="bg-surface h-1.5 w-full overflow-hidden rounded-full"><div className={`h-full rounded-full ${b.key === "60_plus" ? "bg-danger" : "bg-brand"}`} style={{ width: `${(b.count / max) * 100}%` }} /></div>
        </div>
      ))}
      <p className="text-muted/80 mt-1 text-[10px]">{dom.total} מודעות · ותק גבוה לרוב = תמחור גבוה מדי</p>
    </div>
  );
}

// ── Activity vs inventory (honest — never "demand") ─────────────────────────────
function Activity({ d }: { d: MarketCockpit }) {
  const activity = d.pulse.newThisPeriod;
  const inventory = d.scopedCount;
  const pct = inventory > 0 ? Math.min(100, Math.round((activity / inventory) * 100)) : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Metric label="מודעות חדשות" value={nf(activity)} tone="text-brand-strong" />
        <Metric label="מלאי נצפה" value={nf(inventory)} tone="text-ink" />
      </div>
      <div>
        <div className="text-muted mb-1 flex justify-between text-[11px] font-bold"><span>קצב חידוש ({d.pulse.periodDays} ימים)</span><span className="text-ink">{pct}%</span></div>
        <div className="bg-surface h-2 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${pct}%` }} /></div>
      </div>
      <p className="text-muted/80 text-[10px]">״פעילות״ = מודעות חדשות שנצפו (לא ביקוש — ביקוש אינו נמדד מהנתונים הקיימים).</p>
    </div>
  );
}

// ── Data quality ────────────────────────────────────────────────────────────────
function DataQuality({ d }: { d: MarketCockpit }) {
  const updated = d.dataQuality.freshnessDays;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="כיסוי מיקום" value={`${d.dataQuality.geocodedPct}%`} tone="text-ink" />
        <Metric label="מחיר+שטח" value={`${d.dataQuality.priceSqmPct}%`} tone="text-ink" />
      </div>
      <div>
        <p className="text-muted mb-1 font-bold">מקורות</p>
        <div className="flex flex-col gap-1.5">
          {d.dataQuality.sources.slice(0, 4).map((s) => (
            <div key={s.source} className="flex items-center justify-between gap-2"><span className="text-ink font-bold">{sourceLabel(s.source)}</span><span className="text-muted tabular-nums">{s.count}</span></div>
          ))}
        </div>
      </div>
      {updated != null && <p className="text-muted/80 text-[10px]">עדכני ל: {updated === 0 ? "היום" : `לפני ${updated} ימים`}</p>}
      {d.dataQuality.warnings.map((w, i) => <p key={i} className="text-warning text-[10px]">⚠ {w}</p>)}
    </div>
  );
}
const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", homeless: "הומלס", komo: "קומו" };
function sourceLabel(s: string): string { return SOURCE_LABELS[s.toLowerCase()] ?? s; }
