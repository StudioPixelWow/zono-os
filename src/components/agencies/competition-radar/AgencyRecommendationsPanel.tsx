import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgencyEmptyState } from "./AgencyEmptyState";
import {
  PRIORITY_LABEL, PRIORITY_TONE, fmtConfidence, type RadarRecommendation,
} from "@/lib/agencies/ui/competitionRadarFormat";

/** What ZONO recommends doing about this competitor. */
export function AgencyRecommendationsPanel({ items }: { items: RadarRecommendation[] }) {
  return (
    <Card>
      <CardTitle>המלצות פעולה</CardTitle>
      <div className="mt-3">
        {items.length === 0 ? (
          <AgencyEmptyState text="אין עדיין המלצות פעולה למשרד זה." />
        ) : (
          <div className="space-y-2">
            {items.map((r, i) => (
              <div key={i} className="border-line/70 rounded-lg border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-ink text-sm font-semibold">{r.title}</div>
                  <Badge tone={PRIORITY_TONE[r.priority]} size="sm">{PRIORITY_LABEL[r.priority]}</Badge>
                </div>
                <div className="text-muted mt-1 text-[12px] leading-snug">{r.reason}</div>
                <div className="text-muted/80 mt-1 flex items-center gap-2 text-[11px]">
                  {r.relatedTerritory ? <span>אזור: {r.relatedTerritory}</span> : null}
                  <span>· ביטחון {fmtConfidence(r.confidence)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
