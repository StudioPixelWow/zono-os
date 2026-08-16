import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { IconSurface, StatusBadge, EmptyStateVisual, type Accent } from "@/components/ui/action-surfaces";
import { getAgentWorkQueue, type WorkQueueCategory } from "@/lib/today/work-queue";

// Severity → semantic accent + status (§29). Number leads; the icon earns a
// surface; status is scannable — no repetitive identical chips.
const ACCENT: Record<string, Accent> = { critical: "danger", high: "warn", normal: "brand" };
const STATUS: Record<string, string> = { critical: "warning", high: "partial", normal: "building" };
const RING: Record<string, string> = { critical: "border-danger/30", high: "border-warning/30", normal: "border-line" };

/** The prioritized "what to do first" queue — server-rendered, additive to /today. */
export async function AgentWorkQueue() {
  let queue;
  try { queue = await getAgentWorkQueue(); } catch { return null; }
  if (!queue.categories.length) {
    return (
      <section dir="rtl">
        <EmptyStateVisual name="CheckCircle" accent="success" title="התור שלך ריק — הכול מטופל" hint="אין פריטים דחופים כרגע. נעדכן ברגע שיצוף משהו שדורש טיפול." />
      </section>
    );
  }
  return (
    <section dir="rtl" className="bg-card border-line flex flex-col gap-4 rounded-2xl border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2.5">
        <IconSurface name="Flame" tier="m" accent="warn" variant="soft" />
        <div className="flex flex-col">
          <h2 className="text-ink text-lg font-black leading-tight">התור שלך להיום</h2>
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
  const accent = ACCENT[c.severity] ?? "brand";
  return (
    <Link
      href={c.href}
      className={`group flex flex-col gap-2 rounded-xl border bg-card p-3.5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-lg ${RING[c.severity] ?? "border-line"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <IconSurface name={c.icon} tier="s" accent={accent} variant="soft" className="transition-transform group-hover:scale-[1.06]" />
        <span className="text-ink text-3xl font-black leading-none tracking-tight">{c.count}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink text-[13px] font-black">{c.label}</span>
        <StatusBadge status={STATUS[c.severity] ?? "building"} label={c.severity === "critical" ? "דחוף" : c.severity === "high" ? "לטיפול" : "פתוח"} />
      </div>
      {c.items.length > 0 && (
        <ul className="border-line/70 flex flex-col gap-0.5 border-t pt-1.5">
          {c.items.slice(0, 3).map((it, i) => (
            <li key={i} className="text-muted flex items-center gap-1 truncate text-[12px]">
              <Icon name="ChevronLeft" size={11} className="shrink-0" />
              <span className="truncate">{it.title}{it.meta ? ` · ${it.meta}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
