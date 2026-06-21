import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getReputationCommandCenter } from "@/lib/reputation/service";

const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

/** Reviews / referrals / advocates on the home dashboard (server component). */
export async function ReputationDashboardSection() {
  let cc;
  try { cc = await getReputationCommandCenter(); }
  catch (e) { console.error("[reputation] dashboard failed:", e); return null; }
  if (cc.reviewCount === 0 && cc.referralCount === 0 && cc.topAdvocates.length === 0 && cc.opportunities.length === 0) return null;

  const topAdvocate = cc.topAdvocates[0] ?? null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Handshake" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מוניטין והפניות</h2>
        </div>
        <Link href="/reputation" className="text-brand-strong text-sm font-bold hover:underline">למרכז המוניטין ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="הזדמנויות ביקורת" value={String(cc.reviewOpportunities)} tone="text-warning" />
        <Card label="הזדמנויות הפניה" value={String(cc.referralOpportunities)} tone="text-warning" />
        <Card label="שגרירים" value={String(cc.ambassadors)} tone="text-success" />
        <Card label="הכנסה מהפניות" value={ils(cc.referralRevenue)} tone="text-brand-strong" />
      </div>
      {topAdvocate && (
        <div className="bg-brand-soft/40 text-brand-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Handshake" size={15} />התומך המוביל: {topAdvocate.name} ({topAdvocate.referrals} הפניות)
        </div>
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
