import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getAgentWorkQueue, type WorkQueueCategory } from "@/lib/today/work-queue";

const TONE: Record<string, string> = {
  critical: "border-danger/40 bg-danger-soft/40", high: "border-warning/40 bg-warning-soft/30", normal: "border-line bg-surface",
};
const DOT: Record<string, string> = { critical: "text-danger", high: "text-warning", normal: "text-brand-strong" };

/** The prioritized "what to do first" queue — server-rendered, additive to /today. */
export async function AgentWorkQueue() {
  let queue;
  try { queue = await getAgentWorkQueue(); } catch { return null; }
  if (!queue.categories.length) {
    return (
      <section dir="rtl" className="bg-card border-line rounded-2xl border p-5 shadow-sm">
        <h2 className="text-ink text-lg font-black">התור שלך להיום</h2>
        <p className="text-success mt-2 text-sm font-bold">אין פריטים דחופים — הכל מטופל ✓</p>
      </section>
    );
  }
  return (
    <section dir="rtl" className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-lg"><Icon name="Flame" size={16} /></span>
          <h2 className="text-ink text-lg font-black">התור שלך להיום</h2>
          <span className="text-muted text-[12px]">{queue.totalOpen} פריטים · עודכן {queue.generatedAtLabel}</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {queue.categories.map((c) => <QueueCard key={c.key} c={c} />)}
      </div>
    </section>
  );
}

function QueueCard({ c }: { c: WorkQueueCategory }) {
  return (
    <Link href={c.href} className={`flex flex-col gap-2 rounded-xl border p-3 transition hover:shadow-sm ${TONE[c.severity]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[13px] font-black text-ink`}><Icon name={c.icon} size={15} className={DOT[c.severity]} />{c.label}</span>
        <span className={`text-lg font-black ${DOT[c.severity]}`}>{c.count}</span>
      </div>
      {c.items.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {c.items.map((it, i) => (
            <li key={i} className="text-muted truncate text-[12px]">• {it.title}{it.meta ? ` · ${it.meta}` : ""}</li>
          ))}
        </ul>
      )}
    </Link>
  );
}
