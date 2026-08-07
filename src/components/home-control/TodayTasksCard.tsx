"use client";
// ============================================================================
// ZONO — Home · compact "today's tasks" card. Up to ~5 open tasks due today,
// each with time + title + priority + a checkbox to mark done (optimistic, via
// the canonical setHomeTaskDoneAction). Links to the full action center and to
// add a task. The full Kanban/board lives on its own screen — untouched.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { setHomeTaskDoneAction } from "@/lib/home/actions";
import type { HomeTaskItem } from "@/lib/home/home-service";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-danger-soft text-danger",
  high: "bg-danger-soft text-danger",
  medium: "bg-warning-soft text-warning",
  low: "bg-surface text-muted",
};
const PRIORITY_HE: Record<string, string> = { urgent: "דחוף", high: "גבוה", medium: "בינוני", low: "נמוך" };

function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d.getTime() < today.getTime()) return "באיחור";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function TodayTasksCard({ tasks }: { tasks: HomeTaskItem[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();

  const toggle = (id: string) => {
    const next = !done[id];
    setDone((p) => ({ ...p, [id]: next }));
    start(async () => {
      const r = await setHomeTaskDoneAction(id, next);
      if (!r.ok) setDone((p) => ({ ...p, [id]: !next })); // revert on failure
    });
  };

  return (
    <div className="bg-card border-line flex h-full flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="ListChecks" size={16} /></span>
          <h2 className="text-ink text-base font-black">משימות להיום</h2>
        </div>
        <Link href="/action-center" className="text-brand-strong hover:text-brand text-xs font-bold">לכל המשימות</Link>
      </div>

      {tasks.length === 0 ? (
        <div className="text-muted flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
          <Icon name="CheckCircle2" size={24} className="text-success/70" />
          <p className="text-ink text-sm font-bold">אין משימות פתוחות להיום</p>
          <p className="text-xs">כל הכבוד — אתה מעודכן</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task) => {
            const checked = done[task.id] ?? task.status === "done";
            const time = timeLabel(task.dueAt);
            const pr = task.priority ?? "medium";
            return (
              <li key={task.id} className="border-line hover:bg-surface/60 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
                <button
                  type="button"
                  onClick={() => toggle(task.id)}
                  disabled={pending}
                  aria-label={checked ? "בטל השלמה" : "סמן כהושלם"}
                  aria-pressed={checked}
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition",
                    checked ? "bg-success border-success text-white" : "border-line text-transparent hover:border-brand-light",
                  )}
                >
                  <Icon name="Check" size={13} />
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", checked ? "text-muted line-through" : "text-ink")}>{task.title}</span>
                {time && <span className={cn("shrink-0 text-[11px] font-bold", time === "באיחור" ? "text-danger" : "text-muted")}>{time}</span>}
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", PRIORITY_TONE[pr] ?? PRIORITY_TONE.medium)}>{PRIORITY_HE[pr] ?? pr}</span>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/action-center"
        className="border-line text-brand-strong hover:bg-brand-soft mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-sm font-bold transition"
      >
        <Icon name="Plus" size={15} /> הוסף משימה
      </Link>
    </div>
  );
}
