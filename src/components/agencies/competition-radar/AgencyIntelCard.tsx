import { Card } from "@/components/ui/Card";
import { AgencyConfidenceBadge } from "./AgencyConfidenceBadge";
import { fmtScore, type RadarAgencySummary } from "@/lib/agencies/ui/competitionRadarFormat";

/** One competitor in the threat list. Selectable; highlights the active one. */
export function AgencyIntelCard({
  agency, selected, onSelect,
}: { agency: RadarAgencySummary; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <Card
      interactive
      padding="sm"
      onClick={() => onSelect(agency.id)}
      className={selected ? "border-brand ring-1 ring-brand/40 bg-brand-soft/20" : ""}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-ink truncate text-sm font-bold">{agency.name}</div>
          <div className="text-muted truncate text-xs">{agency.city ?? "אזור לא ידוע"}</div>
        </div>
        <div className="shrink-0 text-left">
          <div className="text-muted text-[10px] font-semibold">איום</div>
          <div className="text-danger text-lg font-extrabold leading-none">{fmtScore(agency.threat)}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-muted text-[11px]">כללי {fmtScore(agency.overall)}</span>
        <span className="text-muted text-[11px]">מומנטום {fmtScore(agency.momentum)}</span>
        <AgencyConfidenceBadge value={agency.dataConfidence} />
      </div>
      {agency.topSignalTitle && (
        <div className="text-muted mt-2 truncate text-[11px]">⚡ {agency.topSignalTitle}</div>
      )}
    </Card>
  );
}
