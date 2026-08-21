// ============================================================================
// 🛰️ מודיעין מתווכים — the Broker Intelligence COCKPIT (server component).
// ----------------------------------------------------------------------------
// Hierarchy: INTELLIGENCE → MARKET LANDSCAPE → BROKERS → CONCENTRATION →
// GEOGRAPHY/TYPE → TRENDS → DIRECTORY. The raw broker directory is now the LAST,
// bounded layer. Everything is the OBSERVED market only: honest "observed
// inventory" wording (never market share/performance), a ZONO brief that renders
// only evidence-backed observations (≤3), area competition density, property-type
// specialization, a real "newly observed" signal, and an explicit
// no-fake-collaboration state. Presentation only.
// ============================================================================
import Link from "next/link";
import type { BrokerCockpitBundle } from "@/lib/broker-intel/service";
import type { BrokerInsight, Concentration, AreaCompetition, TypeSpecialization } from "@/lib/broker-intel/cockpit";
import { IntelligenceHeader, IntelligenceKpiGrid, IntelligenceKpi, IntelligenceSection, IntelligenceEmptyState, IntelligenceEmptyInline } from "@/components/intelligence/framework";
import { StatusBadge } from "@/components/intelligence/terminal";
import { BrokerControlBar } from "./BrokerControlBar";
import { BrokerArena } from "./BrokerArena";

export function BrokerCockpitView({ bundle, baseHref }: { bundle: BrokerCockpitBundle; baseHref: string }) {
  const d = bundle.cockpit;
  if (!d.hasData) {
    return (
      <div dir="rtl" className="flex flex-col gap-4">
        <IntelligenceHeader emoji="🛰️" eyebrow="מודיעין מתווכים" title="זירת המתווכים" subtitle="מי פועל בזירה שלך, איפה התחרות מתחזקת ואיפה נפתחת הזדמנות." />
        <IntelligenceEmptyState title="עדיין לא זוהו מתווכים במלאי הנצפה" steps={["סנכרן מודעות שוק חיצוניות", "המתן לזיהוי המפרסמים (מתווך / משרד / בעלים)", "חזור לזירת המתווכים"]} />
      </div>
    );
  }
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <IntelligenceHeader
        emoji="🛰️" eyebrow="מודיעין מתווכים" title="זירת המתווכים"
        subtitle="מי פועל בזירה שלך, איפה התחרות מתחזקת ואיפה נפתחת הזדמנות — מבוסס על המלאי הנצפה."
        status={<StatusBadge label={`${d.dataQuality.attributedPct}% מהמלאי משויך למתווך`} tone={d.dataQuality.attributedPct >= 60 ? "rising" : d.dataQuality.attributedPct >= 30 ? "contender" : "warn"} />}
      />
      <IntelligenceKpiGrid>
        {d.kpis.map((k) => <IntelligenceKpi key={k.key} label={k.label} value={k.value.toLocaleString("he-IL")} hint={k.def} accent={k.key === "brokers"} />)}
      </IntelligenceKpiGrid>
      <BrokerControlBar facets={d.facets} filters={d.filters} />

      {/* ── ZONO brief + concentration ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <ZonoBrief insights={d.insights} />
        <IntelligenceSection title="חלוקת המלאי הנצפה" subtitle={d.concentration.topShareLabel}>
          <ConcentrationView c={d.concentration} />
        </IntelligenceSection>
      </div>

      {/* ── MARKET LANDSCAPE + DIRECTORY + drawer (client) ──────────────────── */}
      <BrokerArena landscape={d.landscape} directory={d.directory} detail={bundle.detail} baseHref={baseHref} />

      {/* ── GEOGRAPHY (competition density) + TYPE specialization ────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceSection title="איפה הזירה צפופה — ואיפה פחות" subtitle="מלאי, מתווכים ומודעות-למתווך לפי אזור" action={<Link href="/market-intelligence/map" prefetch={false} className="text-brand text-xs font-bold">מפה חיה ←</Link>}>
          <AreasView areas={d.areas} />
        </IntelligenceSection>
        <IntelligenceSection title="מי פעיל במה" subtitle="נוכחות מתווכים לפי סוג נכס (נוכחות ≠ מומחיות מוכחת)">
          <TypeView types={d.typeSpecialization} />
        </IntelligenceSection>
      </div>

      {/* ── TRENDS (honest) + DATA QUALITY + collaboration ──────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <IntelligenceSection title="תנועות בזירה" subtitle={`מתווכים חדשים שנצפו · ${d.newlyObserved.period} ימים`}>
          {d.newlyObserved.count === 0
            ? <IntelligenceEmptyInline text="לא נצפו מתווכים חדשים בתקופה. מגמת מלאי לאורך זמן דורשת צבירת צילומי שוק יומיים (עדיין לא זמין)." />
            : <div><div className="text-ink text-3xl font-black tabular-nums">{d.newlyObserved.count}</div><p className="text-muted mb-2 text-xs">מתווכים נצפו לראשונה</p><div className="flex flex-wrap gap-1.5">{d.newlyObserved.names.map((n) => <span key={n} className="bg-brand-soft text-brand-strong rounded-md px-2 py-0.5 text-[11px] font-bold">{n}</span>)}</div></div>}
        </IntelligenceSection>
        <IntelligenceSection title="עם מי שווה לדבר?" subtitle="שיתופי פעולה">
          <div className="border-line rounded-xl border border-dashed p-4">
            <span className="bg-surface text-muted inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-black">ENGINE_REQUIRED</span>
            <p className="text-muted mt-1.5 text-xs leading-relaxed">{d.collaboration.reason}</p>
          </div>
        </IntelligenceSection>
        <IntelligenceSection title="איכות הנתונים" subtitle="שקיפות על הכיסוי">
          <div className="flex flex-col gap-2 text-xs">
            <QRow label="מלאי משויך למתווך" value={`${d.dataQuality.attributedPct}%`} />
            <QRow label="כיסוי מיקום" value={`${d.dataQuality.geocodedPct}%`} />
            <QRow label="שמות שעשויים להיות כפולים" value={String(d.dataQuality.possibleDuplicateNames)} />
            <p className="text-muted/80 mt-1 text-[10px] leading-relaxed">{d.dataQuality.note}</p>
          </div>
        </IntelligenceSection>
      </div>
    </div>
  );
}

function QRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-2"><span className="text-muted">{label}</span><span className="text-ink font-black tabular-nums">{value}</span></div>; }

function ZonoBrief({ insights }: { insights: BrokerInsight[] }) {
  return (
    <div className="border-line bg-card flex flex-col rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand text-white grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black">Z</span>
        <div><p className="text-ink text-sm font-black leading-tight">זונו בזירה</p><p className="text-muted text-[11px]">מבוסס-ראיות בלבד</p></div>
      </div>
      {insights.length === 0
        ? <div className="border-line text-muted grid flex-1 place-items-center rounded-xl border border-dashed p-4 text-center text-xs">אין כרגע תנועה חריגה בזירה. המצב יציב.</div>
        : <div className="flex flex-col gap-2">{insights.map((i) => (
            <div key={i.id} className="border-line rounded-xl border p-3">
              <p className="text-ink text-xs font-black">{i.what}</p>
              <p className="text-muted mt-0.5 text-[11px]">{i.evidence}</p>
              <p className="text-muted/90 mt-1 text-[11px] leading-relaxed">{i.why}</p>
            </div>
          ))}</div>}
    </div>
  );
}

function ConcentrationView({ c }: { c: Concentration }) {
  const max = Math.max(1, ...c.top.map((b) => b.sharePct));
  return (
    <div className="flex flex-col gap-2.5">
      {c.top.map((b) => (
        <div key={b.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="text-ink truncate font-bold">{b.name}</span><span className="text-muted shrink-0 tabular-nums">{b.observedInventory} · {b.sharePct}%</span></div>
          <div className="bg-surface h-2 w-full overflow-hidden rounded-full"><div className="bg-brand-strong h-full rounded-full" style={{ width: `${(b.sharePct / max) * 100}%` }} /></div>
        </div>
      ))}
      <div className="text-muted mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {c.otherBrokers > 0 && <span>עוד {c.otherBrokers} מתווכים · {c.otherInventory} מודעות</span>}
        <span>בעלים פרטי: {c.privateInventory} מודעות</span>
      </div>
      <p className="text-muted/80 text-[10px]">מתודולוגיה: אחוזים מתוך המלאי הנצפה בלבד (מודעות שזוהה עבורן מתווך) — לא נתח שוק מלא.</p>
    </div>
  );
}

function AreasView({ areas }: { areas: AreaCompetition[] }) {
  if (areas.length === 0) return <IntelligenceEmptyInline text="אין נתוני אזורים." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-right text-sm">
        <thead><tr className="text-muted border-line border-b text-[11px]"><th className="py-2 pe-3 font-bold">אזור</th><th className="px-3 py-2 font-bold tabular-nums">מודעות</th><th className="px-3 py-2 font-bold tabular-nums">מתווכים</th><th className="ps-3 py-2 font-bold tabular-nums">מודעות/מתווך</th></tr></thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.name} className="border-line/60 border-b last:border-0">
              <td className="text-ink py-2.5 pe-3 font-bold">{a.name}</td>
              <td className="text-ink px-3 py-2.5 tabular-nums">{a.listings}</td>
              <td className="text-muted px-3 py-2.5 tabular-nums">{a.brokers}</td>
              <td className="px-3 py-2.5 tabular-nums"><span className={a.listingsPerBroker >= 6 ? "text-danger font-bold" : "text-ink"}>{a.listingsPerBroker}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted/80 mt-2 text-[10px]">מודעות/מתווך גבוה = זירה צפופה. ראיות שקופות, ללא ציון תחרות מפוברק.</p>
    </div>
  );
}

function TypeView({ types }: { types: TypeSpecialization[] }) {
  if (types.length === 0) return <IntelligenceEmptyInline text="אין נתוני סוגי נכס." />;
  return (
    <div className="flex flex-col gap-3">
      {types.map((t) => (
        <div key={t.type}>
          <p className="text-ink mb-1 text-xs font-black">{t.type}</p>
          <div className="flex flex-wrap gap-1.5">
            {t.brokers.map((b) => <span key={b.name} className="bg-surface text-ink rounded-md px-2 py-0.5 text-[11px] font-bold">{b.name} · {b.count}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}
