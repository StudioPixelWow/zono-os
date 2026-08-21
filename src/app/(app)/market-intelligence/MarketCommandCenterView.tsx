// ============================================================================
// 🧭 Market Intelligence COMMAND CENTER — the rebuilt /market-intelligence landing.
// ----------------------------------------------------------------------------
// Replaces the old "navigation-noise → filterable listings dump" with a single
// synthesized command center: a primary action metric, KPI grid with real
// day-over-day deltas, a prioritized opportunity queue (with disclosed reasons),
// neighborhood ₪/m² intelligence, a REAL price-drop trend + an HONESTLY GATED
// long-horizon trend (DATA_REQUIRED until enough daily snapshots exist), and a
// live feed. Presentation only — every value comes from the pure command-center
// model; nothing is computed or fabricated here.
// ============================================================================
import Link from "next/link";
import type { CommandCenter, Kpi, LocalityTrend, TrendSeries } from "@/lib/market-intelligence/command-center";
import {
  IntelligenceHeader, IntelligenceActionBar, IntelligenceActionLink, IntelligenceSection,
  IntelligenceFeed, IntelligenceEmptyState, IntelligenceEmptyInline,
} from "@/components/intelligence/framework";
import { BarMeter, StatusBadge } from "@/components/intelligence/terminal";
import { MiniChart } from "@/components/dashboard/MiniChart";

const nf = (n: number | null, prefix = ""): string => (n == null ? "—" : `${prefix}${Math.round(n).toLocaleString("he-IL")}`);
const KPI_TONE: Record<string, string> = {
  brand: "text-brand-strong", success: "text-success", warning: "text-warning", danger: "text-danger", neutral: "text-ink",
};
const DELTA_CLS: Record<string, string> = {
  up: "bg-success-soft text-success", down: "bg-danger-soft text-danger", flat: "bg-surface text-muted",
};

export function MarketCommandCenterView({ data }: { data: CommandCenter }) {
  const updated = new Date(data.generatedAtMs).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (!data.hasData) {
    return (
      <div dir="rtl" className="flex flex-col gap-4">
        <IntelligenceHeader emoji="🧭" eyebrow="מודיעין שוק" title="מרכז מודיעין שוק" subtitle="סנכרון נתוני השוק החיצוני יזרים לכאן מודיעין חי." />
        <IntelligenceEmptyState
          title="עדיין אין נתוני שוק להצגה"
          steps={["סנכרן מודעות שוק ממקורות חיצוניים", "המתן להשלמת הסריקה והגאוקודינג", "חזור למרכז המודיעין"]}
        />
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <IntelligenceHeader
        emoji="🧭"
        eyebrow="מודיעין שוק"
        title="מרכז מודיעין שוק"
        subtitle="תמונת השוק החיצוני שלך במבט אחד — הזדמנויות לפעולה, מגמות מחיר ומודיעין שכונתי. לא CRM."
        status={<StatusBadge label={`ביטחון נתונים ${data.dataConfidence}%`} tone={data.dataConfidence >= 70 ? "rising" : data.dataConfidence >= 40 ? "contender" : "warn"} />}
        actions={
          <IntelligenceActionBar>
            <IntelligenceActionLink href="/market-intelligence/listings" primary>🌍 כל מודעות השוק</IntelligenceActionLink>
            <IntelligenceActionLink href="/market-intelligence/map">🗺️ מפת שוק חיה</IntelligenceActionLink>
            <IntelligenceActionLink href="/market-intelligence/dashboard">📊 דשבורד</IntelligenceActionLink>
          </IntelligenceActionBar>
        }
      />

      {/* ── Primary metric + KPI grid ───────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_2.4fr]">
        <div className="border-line bg-card bg-gradient-to-bl from-brand-soft/60 to-transparent relative overflow-hidden rounded-2xl border p-5">
          <p className="text-brand text-[11px] font-black tracking-wide">היום בשוק</p>
          <div className="text-brand-strong mt-1 text-5xl font-black tabular-nums">{data.primary.value.toLocaleString("he-IL")}</div>
          <p className="text-ink mt-1 text-sm font-black">{data.primary.label}</p>
          <p className="text-muted mt-0.5 text-xs">{data.primary.sub}</p>
          {data.priceDropTrend && (
            <div className="mt-4">
              <p className="text-muted mb-1 text-[10px] font-bold">מגמת ירידות מחיר · 30 יום</p>
              <MiniChart series={data.priceDropTrend.series01} type="bar" tone="red" width={220} height={44} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {data.kpis.map((k) => <KpiTile key={k.key} k={k} />)}
        </div>
      </div>

      {/* ── Opportunity queue ───────────────────────────────────────────────── */}
      <IntelligenceSection title="הזדמנויות לפעולה" subtitle="נכסים שדורשים תשומת לב — מתחת למחיר השוק, בעלים פרטי לגיוס, או ירידת מחיר. מדורג לפי פוטנציאל.">
        {data.opportunities.length === 0
          ? <IntelligenceEmptyInline text="אין כרגע הזדמנויות מזוהות. המערכת תסמן אותן ברגע שתופיע חריגה מהשוק." />
          : (
            <div className="flex flex-col gap-2">
              {data.opportunities.map((o, i) => (
                <Link key={o.id} href={o.href} prefetch={false} className="border-line hover:border-brand-light hover:bg-surface group flex items-center gap-3 rounded-xl border p-3 transition">
                  <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black tabular-nums">{i + 1}</span>
                  {o.image
                    ? <img src={o.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    : <span className="bg-surface text-muted grid h-12 w-12 shrink-0 place-items-center rounded-lg text-[10px]">אין תמונה</span>}
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-sm font-black">{o.title}</span>
                    {o.sub && <span className="text-muted block truncate text-xs">{o.sub}</span>}
                    <span className="mt-1 flex flex-wrap gap-1">
                      {o.reasons.slice(0, 3).map((r, ri) => (
                        <span key={ri} className="bg-brand-soft text-brand-strong inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold">{r}</span>
                      ))}
                    </span>
                  </span>
                  {o.price != null && o.price > 0 && <span className="text-ink shrink-0 text-sm font-black tabular-nums">{nf(o.price, "₪")}</span>}
                </Link>
              ))}
            </div>
          )}
      </IntelligenceSection>

      {/* ── Trends: real price-drop trend + gated long-horizon locality trend ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceSection title="מגמת ירידות מחיר" subtitle="אירועי ירידת מחיר בשוק ב-30 הימים האחרונים (נתוני אמת).">
          {data.priceDropTrend ? <PriceDropTrend t={data.priceDropTrend} /> : <IntelligenceEmptyInline text="עדיין לא נרשמו מספיק אירועי ירידת מחיר להצגת מגמה." />}
        </IntelligenceSection>
        <IntelligenceSection title="מגמת ₪ למ״ר לאורך זמן" subtitle="מבוסס על צילומי שוק יומיים מצטברים לפי אזור.">
          <LocalityTrendBlock t={data.localityTrend} />
        </IntelligenceSection>
      </div>

      {/* ── Neighborhood intelligence ───────────────────────────────────────── */}
      <IntelligenceSection title="מודיעין שכונתי" subtitle={`${data.neighborhoodsTotal} שכונות · ${data.cities} ערים — מדורג לפי מלאי`}>
        {data.neighborhoods.length === 0
          ? <IntelligenceEmptyInline text="אין נתוני שכונות." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-right text-sm">
                <thead>
                  <tr className="text-muted border-line border-b text-[11px]">
                    <th className="py-2 pe-3 font-bold">שכונה</th>
                    <th className="px-3 py-2 font-bold tabular-nums">מלאי</th>
                    <th className="px-3 py-2 font-bold tabular-nums">₪/מ״ר (חציון)</th>
                    <th className="px-3 py-2 font-bold tabular-nums">מתחת לשוק</th>
                    <th className="px-3 py-2 font-bold tabular-nums">בעלים פרטי</th>
                    <th className="ps-3 py-2 font-bold tabular-nums">חדש היום</th>
                  </tr>
                </thead>
                <tbody>
                  {data.neighborhoods.map((n) => (
                    <tr key={`${n.name}-${n.city ?? ""}`} className="border-line/60 border-b last:border-0">
                      <td className="py-2.5 pe-3">
                        <span className="text-ink block font-black">{n.name}</span>
                        {n.city && n.city !== n.name && <span className="text-muted block text-[11px]">{n.city}</span>}
                      </td>
                      <td className="text-ink px-3 py-2.5 font-bold tabular-nums">{n.inventory}</td>
                      <td className="text-ink px-3 py-2.5 tabular-nums">{nf(n.avgPricePerSqm, "₪")}</td>
                      <td className="px-3 py-2.5 tabular-nums">{n.belowAvg > 0 ? <span className="text-danger font-bold">{n.belowAvg}</span> : <span className="text-muted">0</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{n.privateOwner > 0 ? <span className="text-brand-strong font-bold">{n.privateOwner}</span> : <span className="text-muted">0</span>}</td>
                      <td className="ps-3 py-2.5 tabular-nums">{n.newToday > 0 ? <span className="text-success font-bold">+{n.newToday}</span> : <span className="text-muted">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </IntelligenceSection>

      {/* ── Live feed + source mix ──────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <IntelligenceSection title="פיד שוק חי" subtitle="המודעות החדשות ביותר שנסרקו">
          <IntelligenceFeed items={data.feed.map((f) => ({ id: f.id, title: f.title, detail: f.sub, meta: f.meta, href: f.href }))} emptyText="אין מודעות חדשות." />
        </IntelligenceSection>
        <IntelligenceSection title="מקורות הנתונים" subtitle="מאיפה נסרק המלאי">
          {data.sourceMix.length === 0
            ? <IntelligenceEmptyInline text="אין מקורות." />
            : (
              <div className="flex flex-col gap-3">
                {data.sourceMix.map((s) => <BarMeter key={s.source} label={sourceLabel(s.source)} value={s.count} max={data.sourceMix[0].count} />)}
                <p className="text-muted/80 mt-1 text-[10px]">עודכן {updated}</p>
              </div>
            )}
        </IntelligenceSection>
      </div>
    </div>
  );
}

function KpiTile({ k }: { k: Kpi }) {
  const value = k.key === "pps" ? nf(k.value, "₪") : nf(k.value);
  const dir = k.delta == null ? null : k.delta > 0 ? "up" : k.delta < 0 ? "down" : "flat";
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={`text-2xl font-black tabular-nums ${KPI_TONE[k.tone] ?? "text-ink"}`}>{value}</div>
        {dir && k.deltaLabel && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${DELTA_CLS[dir]}`}>{dir === "up" ? "▲" : dir === "down" ? "▼" : "•"} {k.deltaLabel}</span>}
      </div>
      <div className="text-muted mt-1 text-[11px] font-bold leading-tight">{k.label}</div>
      {k.hint && <div className="text-muted/80 mt-0.5 text-[10px]">{k.hint}</div>}
    </div>
  );
}

function PriceDropTrend({ t }: { t: TrendSeries }) {
  const peak = Math.max(...t.raw);
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-ink text-3xl font-black tabular-nums">{t.total}</div>
          <p className="text-muted text-xs">ירידות מחיר ב-30 יום</p>
        </div>
        <MiniChart series={t.series01} type="bar" tone="red" width={200} height={48} />
      </div>
      <p className="text-muted/80 mt-3 text-[10px]">שיא יומי: {peak} · טווח: 30 ימים אחרונים</p>
    </div>
  );
}

function LocalityTrendBlock({ t }: { t: LocalityTrend }) {
  if (t.status === "ready") {
    const first = t.points[0].value, last = t.points[t.points.length - 1].value;
    const deltaPct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
    return (
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-ink text-3xl font-black tabular-nums">{nf(last, "₪")}</div>
            <p className="text-muted text-xs">{t.localityName} · ₪ למ״ר</p>
          </div>
          <MiniChart series={t.series01} type="line" tone={deltaPct >= 0 ? "green" : "red"} width={200} height={48} />
        </div>
        <p className="text-muted/80 mt-3 text-[10px]">{deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}% על פני {t.points.length} צילומי שוק</p>
      </div>
    );
  }
  return (
    <div className="border-line rounded-xl border border-dashed p-4">
      <div className="flex items-center gap-2">
        <span className="bg-warning-soft text-warning inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-black">DATA_REQUIRED</span>
        <p className="text-ink text-xs font-black">נדרשים עוד צילומי שוק יומיים</p>
      </div>
      <p className="text-muted mt-1.5 text-xs leading-relaxed">
        מגמת מחיר אמינה לאורך זמן נבנית מצילומי שוק יומיים מצטברים. יש כרגע {t.havePoints} מתוך {t.needPoints} הנדרשים לאזור. המגמה תופיע אוטומטית ברגע שייצבר מספיק היסטוריה — בלי להמציא נתונים.
      </p>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", homeless: "הומלס", komo: "קומו" };
function sourceLabel(s: string): string { return SOURCE_LABELS[s.toLowerCase()] ?? s; }
