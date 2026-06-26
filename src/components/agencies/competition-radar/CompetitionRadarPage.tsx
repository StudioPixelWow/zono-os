"use client";
import { useCallback, useState, useTransition } from "react";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { CompetitionRadarHeader } from "./CompetitionRadarHeader";
import { CompetitionKpiStrip } from "./CompetitionKpiStrip";
import { AgencyThreatList } from "./AgencyThreatList";
import { AgencyConfidenceBadge } from "./AgencyConfidenceBadge";
import { TerritoryDominancePanel } from "./TerritoryDominancePanel";
import { AgencySignalsPanel } from "./AgencySignalsPanel";
import { AgencyTimelinePanel } from "./AgencyTimelinePanel";
import { AgencySwotPanel } from "./AgencySwotPanel";
import { AgencyRecommendationsPanel } from "./AgencyRecommendationsPanel";
import { AgencyEmptyState } from "./AgencyEmptyState";
import { RadarExportButtons } from "./RadarExportButtons";
import { Card } from "@/components/ui/Card";
import {
  refreshCompetitionRadarIntelligence, getCompetitionRadarAgencyDetailsAction,
} from "@/lib/agencies/ui/competitionRadarActions";
import {
  pickEmptyState, fmtScore, RADAR_EMPTY_TEXT,
  type RadarOverview, type RadarAgencySummary, type RadarAgencyDetails,
} from "@/lib/agencies/ui/competitionRadarFormat";

export interface CompetitionRadarPageProps {
  overview: RadarOverview;
  agencies: RadarAgencySummary[];
  scoredCount: number;
  selected: RadarAgencyDetails | null;
}

/** Top-level Competition Radar dashboard (Phase 26.8). Client orchestrator. */
export function CompetitionRadarPage({ overview, agencies, scoredCount, selected }: CompetitionRadarPageProps) {
  const runner = useActionRunner();
  const [details, setDetails] = useState<RadarAgencyDetails | null>(selected);
  const [selectedId, setSelectedId] = useState<string | null>(selected?.agencyId ?? agencies[0]?.id ?? null);
  const [loadingDetails, startLoad] = useTransition();
  const empty = pickEmptyState(overview, scoredCount);

  const handleSelect = useCallback((id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    startLoad(async () => {
      const res = await getCompetitionRadarAgencyDetailsAction(id);
      if (res.ok) setDetails(res.data);
    });
  }, [selectedId]);

  const handleRefresh = useCallback(() => {
    runner.run(() => refreshCompetitionRadarIntelligence().then((r) => {
      if (!r.ok) throw new Error(r.error);
      return r.data;
    }), { pendingMessage: "מריץ ניתוח מתחרים…", success: (d) => d.message });
  }, [runner]);

  return (
    <div className="space-y-5" dir="rtl">
      <CompetitionRadarHeader
        onRefresh={handleRefresh}
        refreshing={runner.pending}
        lastConfidence={details?.dataConfidence ?? null}
      />

      {empty === "none" && <RadarExportButtons agencyId={details?.agencyId ?? null} agencyCity={details?.city ?? null} />}

      {(runner.note || runner.error) && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${runner.error ? "border-danger/40 bg-danger-soft/40 text-danger" : "border-success/40 bg-success-soft/40 text-success"}`}>
          {runner.error ?? runner.note}
        </div>
      )}

      <CompetitionKpiStrip overview={overview} />

      {empty === "no_agencies" ? (
        <AgencyEmptyState title="רדאר מתחרים" text={RADAR_EMPTY_TEXT.no_agencies} />
      ) : empty === "no_scores" ? (
        <AgencyEmptyState title="המשרדים זוהו" text={RADAR_EMPTY_TEXT.no_scores} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <AgencyThreatList agencies={agencies} selectedId={selectedId} onSelect={handleSelect} />
          </div>
          <div className="space-y-4 lg:col-span-2">
            {details ? (
              <>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-ink text-lg font-extrabold">{details.agencyName}</div>
                      <div className="text-muted text-xs">{details.city ?? "אזור לא ידוע"}</div>
                    </div>
                    <div className="flex items-center gap-4 text-center">
                      <Metric label="איום" value={fmtScore(details.threat)} tone="text-danger" />
                      <Metric label="כללי" value={fmtScore(details.overall)} tone="text-ink" />
                      <Metric label="מומנטום" value={fmtScore(details.momentum)} tone="text-brand-strong" />
                      <AgencyConfidenceBadge value={details.dataConfidence} size="md" />
                    </div>
                  </div>
                  {details.executiveSummary && (
                    <p className="text-muted mt-3 border-t border-line pt-3 text-sm leading-relaxed">{details.executiveSummary}</p>
                  )}
                  {loadingDetails && <div className="text-muted mt-2 text-xs">טוען מודיעין…</div>}
                </Card>
                <TerritoryDominancePanel rows={details.territories} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <AgencySignalsPanel signals={details.signals} />
                  <AgencyTimelinePanel rows={details.timeline} />
                </div>
                <AgencySwotPanel swot={details.swot} />
                <AgencyRecommendationsPanel items={details.recommendations} />
              </>
            ) : (
              <AgencyEmptyState text="בחר משרד מהרשימה כדי לראות מודיעין מפורט." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="text-muted text-[10px] font-semibold">{label}</div>
      <div className={`text-xl font-extrabold leading-none ${tone}`}>{value}</div>
    </div>
  );
}
