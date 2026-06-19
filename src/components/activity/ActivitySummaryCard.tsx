import { cn } from "@/lib/utils";
import type { ActivitySummary } from "@/lib/activity/types";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="bg-surface flex flex-col gap-0.5 rounded-2xl p-3">
      <span className={cn("text-2xl font-black", tone ?? "text-ink")}>{value}</span>
      <span className="text-muted text-[11px] font-semibold">{label}</span>
    </div>
  );
}

/** Compact activity summary for an entity (from the unified activity layer). */
export function ActivitySummaryCard({
  summary,
  extra,
}: {
  summary: ActivitySummary;
  extra?: { openTasks?: number; openRisks?: number };
}) {
  const days = summary.daysWithoutActivity;
  const daysTone =
    days == null ? "text-muted" : days >= 14 ? "text-danger" : days >= 7 ? "text-warning" : "text-success";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="ימים ללא פעילות" value={days ?? "—"} tone={daysTone} />
      <Stat label="משימות שהושלמו" value={summary.tasksCompleted} />
      <Stat label="פגישות שנקבעו" value={summary.meetingsScheduled} />
      <Stat label="נקודות מגע" value={summary.touchpoints} />
      {extra?.openTasks != null && <Stat label="משימות פתוחות" value={extra.openTasks} />}
      {extra?.openRisks != null && <Stat label="סיכונים פתוחים" value={extra.openRisks} tone="text-danger" />}
      <Stat label="הערות" value={summary.notesCreated} />
      <Stat label="סה״כ אירועים" value={summary.totalEvents} />
    </div>
  );
}
