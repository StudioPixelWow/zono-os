import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getAutomationCommandCenter } from "@/lib/automation/service";

/** Automation orchestration summary on the home dashboard (server component). */
export async function AutomationDashboardSection() {
  let cc;
  try { cc = await getAutomationCommandCenter(); }
  catch (e) { console.error("[automation] dashboard failed:", e); return null; }
  const a = cc.analytics;
  if (a.workflowsTotal === 0 && a.runsTotal === 0) return null;

  const topOpp = cc.runs.find((r) => r.status === "applied" && r.opportunities_generated > 0) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Route" size={16} /></span>
          <h2 className="text-ink text-lg font-black">אוטומציה ותהליכים</h2>
        </div>
        <Link href="/automation" className="text-brand-strong text-sm font-bold hover:underline">למרכז האוטומציה ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="ממתינות לאישור" value={a.pending} tone="text-warning" />
        <Card label="הושלמו היום" value={a.completedToday} tone="text-success" />
        <Card label="ריצות שנכשלו" value={a.failed} tone="text-danger" />
        <Card label="הזדמנויות שנוצרו" value={a.opportunitiesGenerated} tone="text-brand-strong" />
      </div>
      {a.pending > 0 && (
        <Link href="/automation" className="bg-warning-soft text-warning flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Clock" size={15} />{a.pending} ריצות ממתינות לאישור שלך
        </Link>
      )}
      {topOpp && (
        <div className="bg-brand-soft/40 text-brand-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Sparkles" size={15} />הזדמנות חדשה מאוטומציה: {topOpp.workflow_name}
        </div>
      )}
    </section>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-3 shadow-sm">
      <span className="text-muted text-[12px] font-bold">{label}</span>
      <span className={`text-2xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
