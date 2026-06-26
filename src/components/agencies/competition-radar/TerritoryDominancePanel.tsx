import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgencyEmptyState } from "./AgencyEmptyState";
import { fmtScore, fmtShare, fmtConfidence, type RadarTerritoryRow } from "@/lib/agencies/ui/competitionRadarFormat";

/** Where this competitor dominates: territory, share, momentum, confidence. */
export function TerritoryDominancePanel({ rows }: { rows: RadarTerritoryRow[] }) {
  return (
    <Card>
      <CardTitle>שליטה אזורית</CardTitle>
      <div className="mt-3">
        {rows.length === 0 ? (
          <AgencyEmptyState text="אין עדיין נתוני שליטה אזורית למשרד זה." />
        ) : (
          <div className="space-y-2">
            {rows.map((t, i) => (
              <div key={`${t.label}-${i}`} className="border-line/70 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-ink truncate text-sm font-semibold">{t.label}</div>
                  <div className="text-muted text-[11px]">{t.territoryType}{t.trend ? ` · ${t.trend}` : ""}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-center">
                  <Stat label="שליטה" value={fmtScore(t.dominance)} />
                  <Stat label="נתח" value={fmtShare(t.inventoryShare)} />
                  <Stat label="מומנטום" value={fmtScore(t.momentum)} />
                  <Badge tone="neutral" size="sm">ביטחון {fmtConfidence(t.confidence)}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted text-[10px]">{label}</div>
      <div className="text-ink text-sm font-bold">{value}</div>
    </div>
  );
}
