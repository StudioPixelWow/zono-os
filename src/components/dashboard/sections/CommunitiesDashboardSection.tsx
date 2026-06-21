import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getCommunityCommandCenter } from "@/lib/community/service";

/** Community execution summary on the home dashboard (server component). */
export async function CommunitiesDashboardSection() {
  let cc;
  try { cc = await getCommunityCommandCenter(); }
  catch (e) { console.error("[communities] dashboard failed:", e); return null; }
  if (cc.totalCommunities === 0 && cc.comments.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Users" size={16} /></span>
          <h2 className="text-ink text-lg font-black">קהילות פייסבוק</h2>
        </div>
        <Link href="/communities" className="text-brand-strong text-sm font-bold hover:underline">למרכז הקהילות ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="קהילות" value={cc.totalCommunities} tone="text-ink" />
        <Card label="לידים מיוחסים" value={cc.leadsAttributed} tone="text-success" />
        <Card label="עסקאות מיוחסות" value={cc.dealsAttributed} tone="text-brand-strong" />
        <Card label="תגובות חמות" value={cc.hotComments} tone="text-warning" />
      </div>
      {cc.hotComments > 0 && (
        <Link href="/communities" className="bg-warning-soft text-warning flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Flame" size={15} />{cc.hotComments} תגובות בכוונה גבוהה ממתינות להמרה לליד
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
