"use client";
import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgencyEmptyState } from "./AgencyEmptyState";
import {
  filterSignalsBySeverity, severityTone, SEVERITY_LABEL, fmtConfidence,
  RADAR_EMPTY_TEXT, type RadarSignalRow, type RadarSeverity,
} from "@/lib/agencies/ui/competitionRadarFormat";

const FILTERS: { key: RadarSeverity; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "critical", label: "קריטי" },
  { key: "high", label: "גבוה" },
  { key: "medium", label: "בינוני" },
  { key: "low", label: "נמוך" },
];

/** Market signals for the selected competitor, with a client-side severity filter. */
export function AgencySignalsPanel({ signals }: { signals: RadarSignalRow[] }) {
  const [severity, setSeverity] = useState<RadarSeverity>("all");
  const rows = filterSignalsBySeverity(signals, severity);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>אותות שוק</CardTitle>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setSeverity(f.key)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                severity === f.key ? "bg-brand text-white" : "bg-line/60 text-muted hover:bg-line"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        {signals.length === 0 ? (
          <AgencyEmptyState text={RADAR_EMPTY_TEXT.no_signals} />
        ) : rows.length === 0 ? (
          <AgencyEmptyState text="אין אותות בחומרה שנבחרה." />
        ) : (
          <div className="space-y-2">
            {rows.map((s) => (
              <div key={s.id} className="border-line/70 rounded-lg border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-ink text-sm font-semibold">{s.title}</div>
                  <Badge tone={severityTone(s.severity)} size="sm">{SEVERITY_LABEL[s.severity ?? ""] ?? "אות"}</Badge>
                </div>
                {s.description && <div className="text-muted mt-1 text-[12px] leading-snug">{s.description}</div>}
                <div className="text-muted/80 mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span>{s.detectedAt}</span>
                  {s.territoryLabel ? <span>· {s.territoryLabel}</span> : null}
                  <span>· ביטחון {fmtConfidence(s.confidence)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
