// ============================================================================
// 🏘️ ZONO — Street & Building Intelligence dashboard (server component). 34.1.
// Ranks recruitment targets at the street + building level from public
// transaction activity. Feeds the EXISTING acquisition / seller-intelligence
// flows (linked). Read-only; approval-gated actions live in those flows.
// ============================================================================
import Link from "next/link";
import { getStreetBuildingIntelligence, type StreetIntel, type BuildingIntel } from "@/lib/street-building-intel";

const OPP: Record<string, { label: string; cls: string }> = {
  high: { label: "הזדמנות גבוהה", cls: "bg-success-soft text-success" },
  medium: { label: "בינונית", cls: "bg-brand-soft text-brand" },
  low: { label: "נמוכה", cls: "bg-surface text-muted" },
};
const nf = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);

function StreetRow({ s }: { s: StreetIntel }) {
  const o = OPP[s.opportunity];
  return (
    <div className="bg-surface flex items-center gap-3 rounded-2xl p-3">
      <div className="text-brand grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[13px] font-black shadow">{s.recruitmentScore}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink line-clamp-1 text-[14px] font-bold">{s.street}{s.city ? <span className="text-muted font-normal"> · {s.city}</span> : null}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.cls}`}>{o.label}</span>
        </div>
        <div className="text-muted mt-0.5 flex flex-wrap gap-2 text-[11px]"><span>{s.transactions} עסקאות</span><span>{s.recentDeals} אחרונות</span><span>ממוצע {nf(s.avgPrice)}</span>{s.luxuryShare >= 20 && <span>{Math.round(s.luxuryShare)}% יוקרה</span>}{s.marketShare != null && <span>נתח {s.marketShare}%</span>}</div>
        <p className="text-muted mt-1 text-[11px]">{s.aiRecommendation}</p>
      </div>
      <Link href="/distribution/campaign-wizard" className="bg-brand shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold text-white">גיוס</Link>
    </div>
  );
}

function BuildingRow({ b }: { b: BuildingIntel }) {
  const o = OPP[b.recruitmentPriority];
  return (
    <div className="bg-surface flex items-center justify-between gap-3 rounded-2xl p-3">
      <div className="min-w-0">
        <div className="text-ink line-clamp-1 text-[13px] font-bold">{b.label}{b.city ? <span className="text-muted font-normal"> · {b.city}</span> : null}</div>
        <div className="text-muted mt-0.5 flex flex-wrap gap-2 text-[11px]"><span>{b.transactions} עסקאות</span><span>ממוצע {nf(b.avgPrice)}</span>{b.luxuryScore >= 40 && <span>יוקרה</span>}</div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.cls}`}>{o.label}</span>
    </div>
  );
}

export async function StreetBuildingIntel({ city }: { city?: string }) {
  const intel = await getStreetBuildingIntelligence(city).catch(() => null);
  if (!intel) return null;
  const s = intel.summary;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Inventory Acquisition</p>
          <h1 className="text-ink mt-1 text-2xl font-black">🏘️ מודיעין רחובות ובניינים</h1>
          <p className="text-muted mt-1 text-sm">איפה לגייס מלאי — לפי פעילות עסקאות ברמת רחוב ובניין. מזין את מנוע גיוס הבלעדיות.</p>
        </div>
        <Link href="/acquisition" className="bg-card text-brand rounded-xl px-4 py-2 text-sm font-bold">מרכז הגיוס</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["רחובות", s.streets], ["בניינים", s.buildings], ["רחובות פעילים", s.activeStreets], ["הזדמנות גבוהה", s.highOpportunity], ["ציון גיוס ממוצע", s.avgRecruitment]].map(([l, v]) => (
          <div key={String(l)} className="bg-card border-line rounded-2xl border px-3 py-3 text-center"><div className="text-brand text-2xl font-black">{v as number}</div><div className="text-muted text-[11px] font-bold">{l as string}</div></div>
        ))}
      </section>

      {intel.streets.length === 0 ? (
        <div className="bg-card border-line rounded-[22px] border p-10 text-center">
          <p className="text-ink text-lg font-black">אין עדיין נתוני עסקאות ברמת רחוב</p>
          <p className="text-muted mt-1 text-sm">{intel.notes[0] ?? "נדרשים נתוני עסקאות ציבוריים."}</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section><h2 className="text-ink mb-3 text-lg font-black">רחובות מובילים לגיוס</h2>
            <div className="space-y-2">{intel.streets.slice(0, 12).map((x) => <StreetRow key={x.key} s={x} />)}</div></section>
          <section><h2 className="text-ink mb-3 text-lg font-black">בניינים להזדמנות</h2>
            <div className="space-y-2">{intel.buildings.length ? intel.buildings.slice(0, 12).map((b) => <BuildingRow key={b.key} b={b} />) : <p className="text-muted text-sm">אין עדיין בניינים עם ריכוז עסקאות.</p>}</div></section>
        </div>
      )}
    </div>
  );
}
