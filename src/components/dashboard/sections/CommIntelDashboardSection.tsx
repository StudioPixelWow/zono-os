import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getCommunicationCommandCenter } from "@/lib/comm-intelligence/service";

/** Communication Intelligence OS summary on the home dashboard (server component). */
export async function CommIntelDashboardSection() {
  let cc;
  try { cc = await getCommunicationCommandCenter(); }
  catch (e) { console.error("[comm-intel] dashboard failed:", e); return null; }
  const k = cc.kpis;
  if (k.recentEvents === 0 && k.newObjections === 0 && k.communicationRisks === 0 && k.openOpportunities === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Sparkles" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מודיעין תקשורת</h2>
        </div>
        <Link href="/communication" className="text-brand-strong text-sm font-bold hover:underline">למרכז התקשורת ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card label="התנגדויות חדשות" value={k.newObjections} tone="text-warning" />
        <Card label="הבטחות שנשברו" value={k.brokenCommitments} tone="text-danger" />
        <Card label="סיכוני תקשורת" value={k.communicationRisks} tone="text-danger" />
        <Card label="קונים מוכנים" value={k.readyBuyers} tone="text-success" />
        <Card label="מוכרים מוכנים" value={k.readySellers} tone="text-success" />
      </div>
      {(k.communicationRisks > 0 || k.brokenCommitments > 0) && (
        <Link href="/communication" className="bg-danger-soft text-danger flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="AlertTriangle" size={15} />{k.communicationRisks + k.brokenCommitments} פריטי תקשורת דורשים תשומת לב מיידית
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
