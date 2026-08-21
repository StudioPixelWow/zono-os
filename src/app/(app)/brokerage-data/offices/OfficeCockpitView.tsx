// ============================================================================
// 🏢 זירת המשרדים — the Office Intelligence COCKPIT (server component).
// ----------------------------------------------------------------------------
// Replaces the "מדריך המשרדים" phone book (which showed only 2 offices because it
// was territory + status filtered). Hierarchy: INTELLIGENCE → COVERAGE →
// LANDSCAPE → CONCENTRATION → GEOGRAPHY/NETWORK → DIRECTORY. The honest universe
// is offices with OBSERVED activity; the large UNASSIGNED pool is its own honest
// state; concentration is a share of OBSERVED inventory (never market share); no
// ingestion/step/confidence debug UI. Presentation only.
// ============================================================================
import type { OfficeCockpitBundle } from "@/lib/office-intel/service";
import type { OfficeInsight, OfficeConcentration, OfficeAreaRow, BrandRow } from "@/lib/office-intel/cockpit";
import { IntelligenceHeader, IntelligenceKpiGrid, IntelligenceKpi, IntelligenceSection, IntelligenceEmptyState, IntelligenceEmptyInline } from "@/components/intelligence/framework";
import { StatusBadge } from "@/components/intelligence/terminal";
import { OfficeControlBar } from "./OfficeControlBar";
import { OfficeArena } from "./OfficeArena";

export function OfficeCockpitView({ bundle, baseHref }: { bundle: OfficeCockpitBundle; baseHref: string }) {
  const d = bundle.cockpit;
  if (!d.hasData) {
    return (
      <div dir="rtl" className="flex flex-col gap-4">
        <IntelligenceHeader emoji="🏢" eyebrow="מודיעין משרדים" title="זירת המשרדים" subtitle="מי פועל באזור שלך, איפה נמצא המלאי ואיך מפת התחרות משתנה." />
        <IntelligenceEmptyState title="עדיין לא זוהו משרדים במלאי הנצפה" steps={["סנכרן מודעות שוק חיצוניות", "המתן לזיהוי המשרדים והסוכנים", "חזור לזירת המשרדים"]} />
      </div>
    );
  }
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <IntelligenceHeader
        emoji="🏢" eyebrow="מודיעין משרדים" title="זירת המשרדים"
        subtitle="מי פועל באזור שלך, איפה נמצא המלאי ואיך מפת התחרות משתנה — מבוסס על המלאי הנצפה."
        status={<StatusBadge label={`${d.coverage.attributedPct}% מהמלאי משויך למשרד`} tone={d.coverage.attributedPct >= 50 ? "rising" : d.coverage.attributedPct >= 25 ? "contender" : "warn"} />}
      />
      <IntelligenceKpiGrid>
        {d.kpis.map((k) => <IntelligenceKpi key={k.key} label={k.label} value={k.value.toLocaleString("he-IL")} hint={k.def} accent={k.key === "active_offices"} />)}
      </IntelligenceKpiGrid>
      <OfficeControlBar facets={d.facets} filters={d.filters} />

      {/* Coverage indicator (honest — never "% of the market") */}
      <div className="border-line bg-card rounded-2xl border p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          <span className="text-ink font-black">כיסוי נתונים · המלאי הנצפה</span>
          <span className="text-muted tabular-nums">{d.coverage.attributedListings} מתוך {d.coverage.totalObservedListings} מודעות משויכות למשרד ({d.coverage.attributedPct}%)</span>
        </div>
        <div className="bg-surface h-2 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${d.coverage.attributedPct}%` }} /></div>
        <p className="text-muted/80 mt-2 text-[10px]">{d.coverage.unassignedAgents} סוכנים ו-{d.coverage.unassignedListings} מודעות טרם שויכו למשרד. אלו נתונים תפעוליים אמיתיים — לא הצגה כאילו כל השוק מכוסה.</p>
      </div>

      {/* ZONO brief + concentration */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <ZonoBrief insights={d.insights} />
        <IntelligenceSection title="חלוקת המלאי הנצפה" subtitle={d.concentration.topShareLabel}>
          <ConcentrationView c={d.concentration} />
        </IntelligenceSection>
      </div>

      {/* Landscape + directory + drawer (client) */}
      <OfficeArena landscape={d.landscape} directory={d.directory} detail={bundle.detail} baseHref={baseHref} />

      {/* Geography + brand network */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceSection title="איפה כל משרד פעיל" subtitle="מלאי ומשרדים לפי אזור">
          <AreasView areas={d.areas} />
        </IntelligenceSection>
        <IntelligenceSection title="רשתות בזירה" subtitle="נוכחות רב-סניפית (רשת ≠ סניף — ללא מיזוג אוטומטי)">
          <BrandsView brands={d.brands} />
        </IntelligenceSection>
      </div>

      {/* Unassigned + data quality + identity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <IntelligenceSection title="טרם שויך למשרד" subtitle="פער זיהוי — מידע תפעולי, לא משרד">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-surface rounded-xl p-3"><div className="text-ink text-2xl font-black tabular-nums">{d.unassigned.agents}</div><div className="text-muted text-[11px] font-bold">סוכנים ללא משרד</div></div>
            <div className="bg-surface rounded-xl p-3"><div className="text-ink text-2xl font-black tabular-nums">{d.unassigned.listings}</div><div className="text-muted text-[11px] font-bold">מודעות ללא משרד</div></div>
          </div>
          <p className="text-muted/80 mt-2 text-[10px]">שיוכם ישפר את מפת התחרות. לא מוצג כמשרד מזויף.</p>
        </IntelligenceSection>
        <IntelligenceSection title="זהות משרדים" subtitle="מיזוג רשת/סניף">
          <div className="border-line rounded-xl border border-dashed p-4">
            <span className="bg-surface text-muted inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-black">ENGINE_REQUIRED</span>
            <p className="text-muted mt-1.5 text-xs leading-relaxed">{d.identity.reason}</p>
            {d.dataQuality.possibleDuplicateNames > 0 && <p className="text-warning mt-1.5 text-[11px]">⚠ {d.dataQuality.possibleDuplicateNames} שמות שעשויים להיות כפולים — סומנו לבדיקה, לא מוזגו.</p>}
          </div>
        </IntelligenceSection>
        <IntelligenceSection title="איכות הנתונים" subtitle="שקיפות על הכיסוי">
          <p className="text-muted text-xs leading-relaxed">{d.dataQuality.note}</p>
        </IntelligenceSection>
      </div>
    </div>
  );
}

function ZonoBrief({ insights }: { insights: OfficeInsight[] }) {
  return (
    <div className="border-line bg-card flex flex-col rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand text-white grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black">Z</span>
        <div><p className="text-ink text-sm font-black leading-tight">זונו בזירת המשרדים</p><p className="text-muted text-[11px]">מבוסס-ראיות בלבד</p></div>
      </div>
      {insights.length === 0
        ? <div className="border-line text-muted grid flex-1 place-items-center rounded-xl border border-dashed p-4 text-center text-xs">אין כרגע תנועה חריגה בזירת המשרדים.</div>
        : <div className="flex flex-col gap-2">{insights.map((i) => (
            <div key={i.id} className="border-line rounded-xl border p-3"><p className="text-ink text-xs font-black">{i.what}</p><p className="text-muted mt-0.5 text-[11px]">{i.evidence}</p><p className="text-muted/90 mt-1 text-[11px] leading-relaxed">{i.why}</p></div>
          ))}</div>}
    </div>
  );
}

function ConcentrationView({ c }: { c: OfficeConcentration }) {
  const max = Math.max(1, ...c.top.map((b) => b.sharePct));
  return (
    <div className="flex flex-col gap-2.5">
      {c.top.length === 0 ? <IntelligenceEmptyInline text="אין עדיין מלאי משויך למשרדים." /> : c.top.map((b) => (
        <div key={b.id}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="text-ink truncate font-bold">{b.name}</span><span className="text-muted shrink-0 tabular-nums">{b.observedListings} · {b.sharePct}%</span></div>
          <div className="bg-surface h-2 w-full overflow-hidden rounded-full"><div className="bg-brand-strong h-full rounded-full" style={{ width: `${(b.sharePct / max) * 100}%` }} /></div>
        </div>
      ))}
      <div className="text-muted mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {c.otherOffices > 0 && <span>עוד {c.otherOffices} משרדים · {c.otherInventory} מודעות</span>}
        <span>ללא שיוך למשרד: {c.unassignedInventory} מודעות</span>
      </div>
      <p className="text-muted/80 text-[10px]">מתודולוגיה: אחוזים מתוך המלאי הנצפה בלבד — לא נתח שוק מלא.</p>
    </div>
  );
}

function AreasView({ areas }: { areas: OfficeAreaRow[] }) {
  if (areas.length === 0) return <IntelligenceEmptyInline text="אין נתוני אזורים." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-right text-sm">
        <thead><tr className="text-muted border-line border-b text-[11px]"><th className="py-2 pe-3 font-bold">אזור</th><th className="px-3 py-2 font-bold tabular-nums">מודעות</th><th className="px-3 py-2 font-bold tabular-nums">משרדים</th><th className="ps-3 py-2 font-bold">מוביל</th></tr></thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.name} className="border-line/60 border-b last:border-0">
              <td className="text-ink py-2.5 pe-3 font-bold">{a.name}</td>
              <td className="text-ink px-3 py-2.5 tabular-nums">{a.listings}</td>
              <td className="text-muted px-3 py-2.5 tabular-nums">{a.offices}</td>
              <td className="text-muted px-3 py-2.5 truncate">{a.topOffice ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrandsView({ brands }: { brands: BrandRow[] }) {
  if (brands.length === 0) return <IntelligenceEmptyInline text="לא זוהו רשתות רב-סניפיות." />;
  const max = Math.max(1, ...brands.map((b) => b.offices));
  return (
    <div className="flex flex-col gap-2.5">
      {brands.map((b) => (
        <div key={b.brand}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="text-ink truncate font-bold">{b.brand}</span><span className="text-muted shrink-0 tabular-nums">{b.offices} משרדים · {b.observedListings} מודעות</span></div>
          <div className="bg-surface h-2 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${(b.offices / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
