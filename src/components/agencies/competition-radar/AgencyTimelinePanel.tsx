import { Card, CardTitle } from "@/components/ui/Card";
import { AgencyEmptyState } from "./AgencyEmptyState";
import type { RadarTimelineRow } from "@/lib/agencies/ui/competitionRadarFormat";

/** Chronological intelligence trail for the selected competitor. */
export function AgencyTimelinePanel({ rows }: { rows: RadarTimelineRow[] }) {
  return (
    <Card>
      <CardTitle>ציר זמן מודיעיני</CardTitle>
      <div className="mt-3">
        {rows.length === 0 ? (
          <AgencyEmptyState text="אין עדיין אירועים מתועדים למשרד זה." />
        ) : (
          <ol className="relative space-y-3 pr-4">
            {rows.map((e) => (
              <li key={e.id} className="relative">
                <span className="bg-brand absolute -right-4 top-1.5 h-2 w-2 rounded-full" />
                <div className="text-ink text-sm font-semibold">{e.title}</div>
                <div className="text-muted text-[11px]">
                  {e.eventDate}{e.territoryLabel ? ` · ${e.territoryLabel}` : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
