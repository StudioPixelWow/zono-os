import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getFinancingCommandCenter } from "@/lib/financing/service";

const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

/** Financing readiness + purchasing power on the home dashboard (server component). */
export async function FinancingDashboardSection() {
  let cc;
  try { cc = await getFinancingCommandCenter(); }
  catch (e) { console.error("[financing] dashboard failed:", e); return null; }
  if (cc.profiles.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Landmark" size={16} /></span>
          <h2 className="text-ink text-lg font-black">משכנתא ומימון</h2>
        </div>
        <Link href="/financing" className="text-brand-strong text-sm font-bold hover:underline">למודיעין המימון ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="מוכנים מימונית" value={String(cc.financingReady)} tone="text-success" />
        <Card label="סיכוני מימון" value={String(cc.financingRisks)} tone="text-danger" />
        <Card label="פערי מזומן" value={String(cc.cashGapAlerts)} tone="text-warning" />
        <Card label="כוח קנייה כולל" value={ils(cc.totalPurchasingPower)} tone="text-brand-strong" />
      </div>
      {cc.financingRisks > 0 && (
        <Link href="/financing" className="bg-danger-soft text-danger flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="AlertTriangle" size={15} />{cc.financingRisks} קונים בסיכון מימוני שעלול לעכב עסקאות
        </Link>
      )}
    </section>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-3 shadow-sm">
      <span className="text-muted text-[12px] font-bold">{label}</span>
      <span className={`text-xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
