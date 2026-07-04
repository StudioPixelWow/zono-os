// ============================================================================
// 🏆 ZONO — Local Market Domination Dashboard (server component). 34.0.
// Domination Score + coverage + ranked areas (band-coloured) + top opportunities
// + weak/missing areas + prioritized action queue + 7/30/90 plans. Read-only;
// every action routes to an EXISTING flow; nothing executes here.
// ============================================================================
import Link from "next/link";
import { getMarketDomination, type AreaDomination, type DominationBand, type TerritoryAction } from "@/lib/market-domination";

const BAND: Record<DominationBand, { label: string; cls: string; bar: string }> = {
  dominant: { label: "שליטה", cls: "text-success", bar: "#16a34a" },
  contested: { label: "מתמודד", cls: "text-brand", bar: "#2563eb" },
  weak: { label: "חלש", cls: "text-warning", bar: "#f59e0b" },
  absent: { label: "נעדר", cls: "text-danger", bar: "#dc2626" },
};

function AreaRow({ a }: { a: AreaDomination }) {
  const b = BAND[a.band];
  return (
    <div className="bg-surface flex items-center gap-3 rounded-2xl p-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-black text-white" style={{ background: b.bar }}>{a.dominationScore}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink line-clamp-1 text-[14px] font-bold">{a.name}</span>
          <span className={`text-[11px] font-bold ${b.cls}`}>{b.label}</span>
        </div>
        <div className="text-muted mt-0.5 flex flex-wrap gap-2 text-[11px]"><span>נתח שוק {a.marketShare}%</span><span>ביקוש {a.breakdown.demand}</span><span>תחרות {a.breakdown.competition}</span><span>ביטחון {a.confidence}%</span></div>
      </div>
    </div>
  );
}

function ActionRow({ x }: { x: TerritoryAction }) {
  return (
    <div className="bg-surface flex items-start justify-between gap-3 rounded-2xl p-3">
      <div className="min-w-0">
        <div className="text-ink text-[14px] font-bold">{x.title}</div>
        <p className="text-muted mt-0.5 text-[12px]">{x.why}</p>
        {x.evidence.length > 0 && <p className="text-muted mt-1 text-[10px]">{x.evidence.join(" · ")}</p>}
      </div>
      <Link href={x.cta.href} className="bg-brand shrink-0 rounded-lg px-3 py-2 text-[12px] font-bold text-white">{x.cta.label}</Link>
    </div>
  );
}

export async function DominationDashboard() {
  const d = await getMarketDomination().catch(() => null);
  if (!d) return null;
  const s = d.summary;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO Local Market Domination</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🏆 שליטה בשוק המקומי</h1>
        <p className="text-muted mt-1 text-sm">כל עיר, שכונה ורחוב הופכים לשוק מנוהל: איפה אנחנו שולטים, איפה חסר, ומה התוכנית להשתלט.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {[["ציון שליטה", s.avgScore], ["כיסוי", `${s.coverage}%`], ["אזורים", s.areas], ["שליטה", s.dominant], ["חלשים", s.weak], ["נעדרים", s.absent]].map(([l, v]) => (
          <div key={String(l)} className="bg-card border-line rounded-2xl border px-3 py-3 text-center"><div className="text-brand text-2xl font-black">{v as number | string}</div><div className="text-muted text-[11px] font-bold">{l as string}</div></div>
        ))}
      </section>

      {d.areas.length === 0 ? (
        <div className="bg-card border-line rounded-[22px] border p-10 text-center">
          <p className="text-ink text-lg font-black">אין עדיין נתוני שוק</p>
          <p className="text-muted mt-1 text-sm">{d.notes[0] ?? "חשבו מדדי שוק כדי לבנות אסטרטגיית שליטה."}</p>
          <Link href="/market" className="bg-brand mt-3 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">חישוב מדדי שוק</Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="lg:col-span-2"><h2 className="text-ink mb-3 text-lg font-black">מפת שליטה לפי אזור</h2>
            <div className="grid gap-2 sm:grid-cols-2">{d.areas.slice(0, 12).map((a) => <AreaRow key={a.key} a={a} />)}</div></section>

          <section><h2 className="text-ink mb-3 text-lg font-black">הזדמנויות מובילות</h2>
            <div className="space-y-2">{d.topOpportunities.length ? d.topOpportunities.map((a) => <AreaRow key={a.key} a={a} />) : <p className="text-muted text-sm">אין הזדמנויות בולטות כרגע.</p>}</div></section>

          <section><h2 className="text-ink mb-3 text-lg font-black">אזורים חסרים / חלשים</h2>
            <div className="space-y-2">{[...d.missingAreas, ...d.weakAreas].slice(0, 6).map((a) => <AreaRow key={a.key} a={a} />)}</div></section>

          <section className="lg:col-span-2"><h2 className="text-ink mb-3 text-lg font-black">תור פעולות</h2>
            <div className="grid gap-2 sm:grid-cols-2">{d.actionQueue.slice(0, 10).map((x, i) => <ActionRow key={i} x={x} />)}</div></section>

          <section className="lg:col-span-2"><h2 className="text-ink mb-3 text-lg font-black">תוכנית שליטה</h2>
            <div className="grid gap-3 sm:grid-cols-3">{d.plans.map((p) => (
              <div key={p.horizon} className="bg-card border-line rounded-2xl border p-4">
                <h3 className="text-ink text-[14px] font-black">{p.label}</h3>
                {p.tasks.length === 0 ? <p className="text-muted mt-1 text-[12px]">אין משימות בשלב זה.</p> : (
                  <ul className="mt-2 space-y-1 text-[12px]">{p.tasks.map((t, i) => <li key={i} className="text-ink">• {t.task} <span className="text-muted">({t.area})</span></li>)}</ul>
                )}
              </div>
            ))}</div>
            <p className="text-muted mt-2 text-[11px]">כל משימה מתבצעת רק לאחר אישורכם ומקושרת למערכות הקיימות (אשף קמפיין, קבוצות, שיווק).</p>
          </section>
        </div>
      )}
    </div>
  );
}
