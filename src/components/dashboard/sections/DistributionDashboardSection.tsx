import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getDailyWorkspace } from "@/lib/distribution/service";

/** Today's assisted-publishing queue on the home dashboard. */
export async function DistributionDashboardSection() {
  let ws;
  try { ws = await getDailyWorkspace(); } catch (e) { console.error("[distribution] dashboard failed:", e); return null; }
  if (!ws.batch || ws.items.length === 0) return null;
  const pending = ws.items.filter((i) => ["pending", "copied", "community_opened"].includes(i.status));
  if (pending.length === 0 && ws.batch.published_items === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Send" size={16} /></span>
          <h2 className="text-ink text-lg font-black">שולחן פרסום יומי</h2>
        </div>
        <Link href="/distribution/daily" className="text-brand-strong text-sm font-bold hover:underline">לשולחן המלא ←</Link>
      </div>
      <div className="bg-card border-line rounded-[20px] border p-4">
        <p className="text-muted mb-2 text-[11px] font-bold">{pending.length} ממתינים · {ws.batch.published_items} פורסמו · צפי {ws.batch.expected_leads} לידים</p>
        {pending.length === 0 ? <p className="text-success text-sm font-semibold">סיימת את כל הפרסומים להיום ✓</p> : (
          <ul className="flex flex-col gap-1">{pending.slice(0, 5).map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href="/distribution/daily" className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{i.property_title} · {i.community_name}</Link>
              <span className="text-muted text-[11px]">{i.recommended_time}</span>
            </li>
          ))}</ul>
        )}
      </div>
    </section>
  );
}
