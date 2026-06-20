import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { formatShekels } from "@/lib/utils";
import { getRadarBoard, getStreetsBoard } from "@/lib/transactions/service";

/** Home widgets: below-market opportunities + hot streets from real transactions. */
export async function TransactionsDashboardSection() {
  let radar, streets;
  try {
    [radar, streets] = await Promise.all([getRadarBoard(), getStreetsBoard()]);
  } catch (e) {
    console.error("[transactions] dashboard failed:", e);
    return null;
  }
  const below = radar.alerts.filter((a) => a.opportunity_type === "below_market").slice(0, 4);
  const hotStreets = streets.streets.filter((s) => (s.price_trend_12m ?? 0) >= 6).slice(0, 4);
  if (!below.length && !hotStreets.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ink text-lg font-black">חקר עסקאות באזור</h2>
        <Link href="/transactions" className="text-brand-strong text-sm font-bold hover:underline">לחקר העסקאות ←</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="bg-card border-line rounded-[20px] border p-4">
          <div className="mb-2 flex items-center gap-2"><span className="bg-success-soft text-success grid h-7 w-7 place-items-center rounded-lg"><Icon name="ArrowUpRight" size={14} /></span><p className="text-ink text-sm font-extrabold">נכסים מתחת לשוק</p></div>
          {below.length === 0 ? <p className="text-muted text-sm">אין כרגע — הרץ מחקר עסקאות על נכסים.</p> : (
            <ul className="flex flex-col gap-1.5">{below.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">{a.address ?? a.city_name ?? "נכס"}</span>
                <span className="text-success shrink-0 text-xs font-black">{a.gap_from_market_percent}% {a.estimated_market_value ? `· ${formatShekels(a.estimated_market_value)}` : ""}</span>
              </li>
            ))}</ul>
          )}
        </div>
        <div className="bg-card border-line rounded-[20px] border p-4">
          <div className="mb-2 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="Flame" size={14} /></span><p className="text-ink text-sm font-extrabold">רחובות חמים</p></div>
          {hotStreets.length === 0 ? <p className="text-muted text-sm">אין רחובות במגמת עלייה כרגע.</p> : (
            <ul className="flex flex-col gap-1.5">{hotStreets.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">{s.street} <span className="text-muted text-[10px]">· {s.city_name}</span></span>
                <span className="text-success shrink-0 text-xs font-black">+{s.price_trend_12m}%</span>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </section>
  );
}
