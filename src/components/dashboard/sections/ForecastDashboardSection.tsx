import Link from "next/link";
import { formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getForecastBoard, getForecastKpis } from "@/lib/forecast/service";

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={`mb-1 inline-flex ${tone}`}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}

/** Real forecast KPIs on the home dashboard (server component). */
export async function ForecastDashboardSection() {
  let kpis, board;
  try { [kpis, board] = await Promise.all([getForecastKpis(), getForecastBoard()]); }
  catch (e) { console.error("[forecast] dashboard failed:", e); return null; }
  if (board.likely.length === 0 && board.atRisk.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="TrendingUp" size={16} /></span>
          <h2 className="text-ink text-lg font-black">תחזית עסקאות</h2>
        </div>
        <Link href="/forecast" className="text-brand-strong text-sm font-bold hover:underline">לתחזית המלאה ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="TrendingUp" label="הכנסה משוקללת" value={formatShekels(kpis.pwr)} tone="text-success" />
        <Stat icon="BarChart3" label="עמלה צפויה" value={formatShekels(kpis.commission)} tone="text-brand-strong" />
        <Stat icon="Sparkles" label="צפויות להיסגר (30י׳)" value={String(kpis.closes30)} tone="text-success" />
        <Stat icon="AlertTriangle" label="הכנסה בסיכון" value={formatShekels(kpis.atRiskRevenue)} tone="text-danger" />
      </div>
      <div className="bg-card border-line rounded-[20px] border p-4">
        <p className="text-ink mb-2 text-sm font-extrabold">עסקאות שצפויות להיסגר</p>
        {board.likely.length === 0 ? <p className="text-muted text-xs">—</p> : (
          <ul className="flex flex-col gap-1">{board.likely.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href="/forecast" className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{r.locality ?? "עסקה"}{r.property_type ? ` · ${r.property_type}` : ""}</Link>
              <span className="text-success text-[11px]">{formatShekels(r.probability_weighted_revenue)}</span>
              <span className="text-success shrink-0 text-xs font-black">{r.closing_probability}%</span>
            </li>
          ))}</ul>
        )}
      </div>
    </section>
  );
}
