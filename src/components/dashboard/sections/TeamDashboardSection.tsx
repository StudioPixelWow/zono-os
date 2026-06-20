import Link from "next/link";
import { formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getTeamBoard } from "@/lib/team/service";

const TIER_LABEL: Record<string, string> = { elite: "מצטיין", strong: "חזק", stable: "יציב", declining: "בירידה", critical: "קריטי" };
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

/** Real team/office KPIs on the home dashboard (managers only — agents see nothing here). */
export async function TeamDashboardSection() {
  let board;
  try { board = await getTeamBoard(); } catch (e) { console.error("[team] dashboard failed:", e); return null; }
  // Office snapshot is manager-only via RLS; agents won't see this section.
  if (!board.snapshot || board.agents.length === 0) return null;
  const s = board.snapshot;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Users" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מודיעין צוות</h2>
        </div>
        <Link href="/team" className="text-brand-strong text-sm font-bold hover:underline">למרכז הצוות ←</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="Shield" label="בריאות משרד" value={String(s.office_health_score)} t={tone(s.office_health_score)} />
        <Stat icon="BarChart3" label="הכנסות משרד" value={formatShekels(s.office_revenue)} t="text-success" />
        <Stat icon="Building2" label="צנרת צפויה" value={formatShekels(s.office_forecast_revenue)} t="text-brand-strong" />
        <Stat icon="AlertTriangle" label="זקוקים לליווי" value={String(s.coaching_needed)} t="text-warning" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">סוכנים מובילים</p>
          <ul className="flex flex-col gap-1">{board.topPerformers.slice(0, 5).map((a, i) => (
            <li key={a.user_id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted w-4 text-center font-black">{i + 1}</span>
              <Link href={`/team/${a.user_id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.name}</Link>
              <span className="text-success text-[11px]">{formatShekels(a.total_revenue)}</span>
              <span className={`shrink-0 text-xs font-black ${tone(a.performance_score)}`}>{a.performance_score}</span>
            </li>
          ))}</ul>
        </div>
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">דורשים תשומת לב + ליווי</p>
          {board.needsAttention.length === 0 ? <p className="text-muted text-xs">כל הסוכנים יציבים ✓</p> : (
            <ul className="flex flex-col gap-1">{board.needsAttention.slice(0, 5).map((a) => (
              <li key={a.user_id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/team/${a.user_id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.name}</Link>
                <span className="text-muted text-[11px]">{TIER_LABEL[a.performance_tier]}</span>
                <span className="text-warning shrink-0 text-xs font-black">ליווי {a.coaching_score}</span>
              </li>
            ))}</ul>
          )}
        </div>
      </div>

      {board.actions.length > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">פעולות ניהול היום</p>
          <ol className="flex flex-col gap-1">{board.actions.slice(0, 5).map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <span className="bg-brand text-white grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-black">{m.rank_position}</span>
              {m.href ? <Link href={m.href} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{m.title}</Link> : <span className="text-ink min-w-0 flex-1 truncate font-semibold">{m.title}</span>}
              {m.expected_revenue_impact > 0 && <span className="text-success shrink-0 text-[11px] font-bold">+{formatShekels(m.expected_revenue_impact)}</span>}
            </li>
          ))}</ol>
        </div>
      )}
    </section>
  );
}
