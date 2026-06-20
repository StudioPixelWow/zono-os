import Link from "next/link";
import { formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getRevenueBoard } from "@/lib/revenue/service";

const GAP_LABEL: Record<string, { t: string; c: string }> = {
  on_track: { t: "במסלול", c: "bg-success-soft text-success" },
  watch: { t: "במעקב", c: "bg-brand-soft text-brand-strong" },
  risk: { t: "בסיכון", c: "bg-warning-soft text-warning" },
  critical: { t: "קריטי", c: "bg-danger-soft text-danger" },
};

function Stat({ icon, label, value, t }: { icon: string; label: string; value: string; t: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={`mb-1 inline-flex ${t}`}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}

/** Real revenue KPIs on the home dashboard (managers only via RLS). */
export async function RevenueDashboardSection() {
  let board;
  try { board = await getRevenueBoard(); } catch (e) { console.error("[revenue] dashboard failed:", e); return null; }
  const p = board.profile;
  if (!p) return null;
  const gl = GAP_LABEL[p.gap_level] ?? GAP_LABEL.on_track;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="BarChart3" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מודיעין הכנסות</h2>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${gl.c}`}>{gl.t}</span>
        </div>
        <Link href="/revenue" className="text-brand-strong text-sm font-bold hover:underline">למרכז ההכנסות ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="BarChart3" label="הכנסות החודש" value={formatShekels(p.current_month_revenue)} t="text-success" />
        <Stat icon="TrendingUp" label="צנרת 90 יום" value={formatShekels(p.forecast_revenue_90)} t="text-brand-strong" />
        <Stat icon="Flame" label="פער ליעד" value={formatShekels(p.revenue_gap)} t="text-warning" />
        <Stat icon="AlertTriangle" label="הכנסה בסיכון" value={formatShekels(p.revenue_at_risk)} t="text-danger" />
      </div>
      {board.opportunities.length > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">הזדמנויות הכנסה מהירות</p>
          <ul className="flex flex-col gap-1">{board.opportunities.slice(0, 5).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={o.href} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{o.title}</Link>
              <span className="text-success shrink-0 text-[11px] font-bold">+{formatShekels(o.revenueImpact)}</span>
            </li>
          ))}</ul>
        </div>
      )}
    </section>
  );
}
