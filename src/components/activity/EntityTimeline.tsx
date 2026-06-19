import { Icon } from "@/components/dashboard/Icon";
import { ActivityEventCard } from "./ActivityEventCard";
import type { ActivityEventRow } from "@/lib/activity/types";

/**
 * Unified timeline for any entity, sourced from activity_events.
 * Presentational — the caller loads `items` server-side.
 */
export function EntityTimeline({
  items,
  title = "ציר זמן",
  emptyStateText = "אין פעילות מתועדת עדיין.",
}: {
  items: ActivityEventRow[];
  title?: string;
  emptyStateText?: string;
}) {
  return (
    <div>
      {title && <p className="text-ink mb-3 text-sm font-extrabold">{title}</p>}
      {items.length === 0 ? (
        <div className="text-muted flex flex-col items-center gap-2 py-10 text-center text-sm">
          <span className="bg-surface grid h-12 w-12 place-items-center rounded-2xl">
            <Icon name="Clock" size={22} />
          </span>
          {emptyStateText}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((e) => (
            <ActivityEventCard key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
