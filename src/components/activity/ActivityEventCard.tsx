import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { eventIcon, type ActivityEventRow } from "@/lib/activity/types";

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-danger-soft text-danger",
  urgent: "bg-danger-soft text-danger",
  medium: "bg-brand-soft text-brand-strong",
  low: "bg-surface text-muted",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("he-IL")} · ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

/** A single normalized activity event in a timeline. */
export function ActivityEventCard({ event: e }: { event: ActivityEventRow }) {
  return (
    <li className="flex items-start gap-3">
      <span className="bg-brand-soft text-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl">
        <Icon name={eventIcon(e.event_type)} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-ink text-sm font-semibold">{e.title}</p>
          {e.priority && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", PRIORITY_TONE[e.priority] ?? PRIORITY_TONE.low)}>
              {e.priority}
            </span>
          )}
        </div>
        {e.description && <p className="text-muted text-xs">{e.description}</p>}
        <p className="text-muted mt-0.5 text-[11px]">
          {fmt(e.occurred_at)} · <span className="opacity-70">{e.event_type}</span>
        </p>
      </div>
    </li>
  );
}
