import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getMarketingBoard } from "@/lib/marketing/service";

const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

function Stat({ icon, label, value, t }: { icon: string; label: string; value: string; t: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={`mb-1 inline-flex ${t}`}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}

/** Real marketing KPIs on the home dashboard. */
export async function MarketingDashboardSection() {
  let board;
  try { board = await getMarketingBoard(); } catch (e) { console.error("[marketing] dashboard failed:", e); return null; }
  if (board.communities.length === 0 && board.propertyDna.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Megaphone" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מודיעין שיווק</h2>
        </div>
        <Link href="/marketing" className="text-brand-strong text-sm font-bold hover:underline">למרכז השיווק ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="Shield" label="בריאות שיווק" value={String(board.health)} t={tone(board.health)} />
        <Stat icon="Users" label="קהילות" value={String(board.communities.length)} t="text-brand-strong" />
        <Stat icon="Flame" label="הזדמנויות" value={String(board.opportunities.length)} t="text-warning" />
        <Stat icon="Megaphone" label="נכסים לקידום" value={String(board.propertyDna.filter((d) => d.score >= 55).length)} t="text-success" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {board.opportunities.length > 0 && (
          <div className="bg-card border-line rounded-[20px] border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">הזדמנויות שיווק מובילות</p>
            <ul className="flex flex-col gap-1">{board.opportunities.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">{o.title}</span>
                <span className={`shrink-0 text-xs font-black ${tone(o.impact_score)}`}>{o.impact_score}</span>
              </li>
            ))}</ul>
          </div>
        )}
        {board.topCommunities.length > 0 && (
          <div className="bg-card border-line rounded-[20px] border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">קהילות מובילות</p>
            <ul className="flex flex-col gap-1">{board.topCommunities.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href="/marketing" className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{c.name}</Link>
                <span className={`shrink-0 text-xs font-black ${tone(c.intel?.community_health_score ?? 0)}`}>{c.intel?.community_health_score ?? 0}</span>
              </li>
            ))}</ul>
          </div>
        )}
      </div>
    </section>
  );
}
