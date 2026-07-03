// ============================================================================
// 🗂️ ZONO — Property Marketing Log section (server component). 33.1.x.
// Shows the property's marketing file: every group campaign/post, comment/lead
// and Creative Studio asset, chronologically. Read-only; links out to the
// existing marketing surfaces (nothing publishes here).
// ============================================================================
import Link from "next/link";
import { getPropertyMarketingLog, groupByDay, type MarketingEventKind } from "@/lib/property-marketing-log";

const ICON: Record<MarketingEventKind, string> = {
  campaign: "📣", post_scheduled: "🗓️", post_published: "✅", post_failed: "⛔", post_pending: "⏳",
  comment: "💬", lead: "🎯", creative: "🎨", creative_approved: "🖼️",
};

export async function PropertyMarketingLog({ propertyId }: { propertyId: string }) {
  const log = await getPropertyMarketingLog(propertyId).catch(() => null);
  if (!log) return null;
  const days = groupByDay(log);
  const st = log.summary;

  return (
    <section dir="rtl" className="bg-card border-line rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink flex items-center gap-2 text-lg font-black">🗂️ תיעוד שיווקי לנכס</h2>
        <div className="flex gap-1.5">
          <Link href="/distribution/campaign-wizard" className="bg-brand-soft text-brand rounded-lg px-3 py-1.5 text-[12px] font-bold">קמפיין חדש לקבוצות</Link>
          <Link href="/distribution" className="text-muted rounded-lg px-3 py-1.5 text-[12px] font-bold">מרכז הפצה</Link>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          ["קמפיינים", st.campaigns], ["פורסמו", st.published], ["מתוזמנים", st.scheduled],
          ["תגובות", st.comments], ["לידים", st.leads || st.totalLeads], ["קריאייטיב", st.creatives],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-surface rounded-xl px-2 py-2 text-center">
            <div className="text-brand text-xl font-black">{value as number}</div>
            <div className="text-muted text-[10px] font-bold">{label as string}</div>
          </div>
        ))}
      </div>

      {log.isEmpty ? (
        <div className="py-8 text-center">
          <p className="text-ink text-[15px] font-bold">עדיין לא בוצעו פעולות שיווק לנכס זה</p>
          <p className="text-muted mt-1 text-[13px]">הפעילו קמפיין לקבוצות פייסבוק כדי להתחיל לתעד פרסומים, תגובות ולידים.</p>
          <Link href="/distribution/campaign-wizard" className="bg-brand mt-3 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">בניית קמפיין</Link>
        </div>
      ) : (
        <div className="relative space-y-4 border-r border-slate-200 pr-4">
          {days.map((d) => (
            <div key={d.day}>
              <div className="text-muted mb-1 text-[11px] font-bold">{new Date(d.day).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}</div>
              <ul className="space-y-1.5">
                {d.events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -right-[25px] top-0.5 grid h-6 w-6 place-items-center rounded-full bg-white text-[12px] shadow">{ICON[e.kind]}</span>
                    <div className="text-ink text-[13px] font-bold">{e.title}{e.status ? <span className="text-muted font-normal"> · {e.status}</span> : null}</div>
                    {e.detail && <div className="text-muted text-[11px]">{e.detail}</div>}
                    {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="text-brand text-[11px] font-bold">צפייה ↗</a>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {st.totalReach > 0 && <p className="text-muted mt-3 text-[11px]">סה״כ חשיפות מדווחות: {st.totalReach.toLocaleString("he-IL")}</p>}
    </section>
  );
}
