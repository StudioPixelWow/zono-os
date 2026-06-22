import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getJourneyCommandCenter } from "@/lib/journey-intelligence/service";

/** Journey Intelligence summary on the home dashboard (server component). */
export async function JourneysDashboardSection() {
  let cc;
  try { cc = await getJourneyCommandCenter(); }
  catch (e) { console.error("[journeys] dashboard failed:", e); return null; }
  const k = cc.kpis;
  if (k.activeJourneys === 0 && k.journeyRisks === 0 && k.journeyOpportunities === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Route" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מודיעין מסעות</h2>
        </div>
        <Link href="/journeys" className="text-brand-strong text-sm font-bold hover:underline">למרכז המסעות ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card label="קונים מוכנים" value={k.readyBuyers} tone="text-success" />
        <Card label="מוכרים מוכנים" value={k.readySellers} tone="text-success" />
        <Card label="מסעות תקועים" value={k.stuckJourneys} tone="text-danger" />
        <Card label="סיכוני מסע" value={k.journeyRisks} tone="text-danger" />
        <Card label="הזדמנויות" value={k.journeyOpportunities} tone="text-warning" />
      </div>
      {(k.readyBuyers + k.readySellers) > 0 && (
        <Link href="/journeys" className="bg-success-soft text-success flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Flame" size={15} />{k.readyBuyers + k.readySellers} לקוחות בשלים לסגירה — תעדף אותם היום
        </Link>
      )}
    </section>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-3 shadow-sm">
      <span className="text-muted text-[12px] font-bold">{label}</span>
      <span className={`text-xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
