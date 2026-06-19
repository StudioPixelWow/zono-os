import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getCompetitorBoard } from "@/lib/competitor/service";

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={`mb-1 inline-flex ${tone}`}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-2xl font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}

/** Competitive intelligence dashboard widgets (server component). */
export async function CompetitorDashboardSection() {
  let board;
  try { board = await getCompetitorBoard(); } catch (e) { console.error("[competitors] dashboard failed:", e); return null; }
  if (board.competitors.length === 0) return null;

  const dominant = [...board.competitors].filter((c) => Array.isArray(c.dominant_localities) && (c.dominant_localities as unknown[]).length > 0).slice(0, 5);
  const growing = [...board.competitors].sort((a, b) => b.growth_score - a.growth_score).slice(0, 5);
  const declining = [...board.competitors].sort((a, b) => b.acquisition_risk_score - a.acquisition_risk_score).filter((c) => c.acquisition_risk_score >= 60).slice(0, 5);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Users" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מודיעין מתחרים</h2>
        </div>
        <Link href="/competitors" className="text-brand-strong text-sm font-bold hover:underline">לכל המתחרים ←</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="Flame" label="שולטים בשוק" value={board.cc.dominant} tone="text-danger" />
        <Stat icon="TrendingUp" label="מתחזקים" value={board.cc.growing} tone="text-success" />
        <Stat icon="TrendingDown" label="נחלשים" value={board.cc.declining} tone="text-warning" />
        <Stat icon="Building" label="הזדמנויות גיוס" value={board.cc.opportunities} tone="text-success" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">מתחרים שולטים</p>
          {dominant.length === 0 ? <p className="text-muted text-xs">—</p> : <ul className="flex flex-col gap-1">{dominant.map((c) => <li key={c.id} className="text-sm"><Link href={`/competitors/${c.id}`} className="text-ink hover:text-brand font-semibold">{c.display_name}</Link> <span className="text-muted text-[11px]">· {(c.dominant_localities as { locality: string }[])[0]?.locality}</span></li>)}</ul>}
        </div>
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">מתחזקים</p>
          {growing.length === 0 ? <p className="text-muted text-xs">—</p> : <ul className="flex flex-col gap-1">{growing.map((c) => <li key={c.id} className="text-sm"><Link href={`/competitors/${c.id}`} className="text-ink hover:text-brand font-semibold">{c.display_name}</Link> <span className="text-success text-[11px]">· צמיחה {c.growth_score}</span></li>)}</ul>}
        </div>
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">מאבדים מלאי — הזדמנות גיוס</p>
          {declining.length === 0 ? <p className="text-muted text-xs">—</p> : <ul className="flex flex-col gap-1">{declining.map((c) => <li key={c.id} className="text-sm"><Link href={`/competitors/${c.id}`} className="text-ink hover:text-brand font-semibold">{c.display_name}</Link> <span className="text-warning text-[11px]">· פגיעות {c.acquisition_risk_score}</span></li>)}</ul>}
        </div>
      </div>
    </section>
  );
}
