"use server";
// ============================================================================
// ZONO — Competition Radar server actions (Phase 26.8, refresh rewired in 26.11).
// The refresh action now runs the ORCHESTRATED daily agency-intelligence pipeline
// (resolve → graph → territory → scores → signals → reports → RAIN) via a single
// idempotent, logged job instead of firing the steps separately. Read-only
// otherwise. No destructive actions.
// ============================================================================
import {
  getCompetitionRadarAgencyDetails, getCompetitionRadarTerritories, getCompetitionRadarSignals,
  getCompetitionRadarTimeline,
  type RadarTerritoryFilters, type RadarSignalFilters,
} from "./competitionRadarQueries";
import { currentOrgId } from "../_context";
import { runDailyAgencyIntelligenceJob } from "../jobs/dailyAgencyIntelligenceJob";
import type { AgencyJobStepName, DailyAgencyIntelligenceResult } from "../jobs/agencyJobTypes";
import type {
  RadarAgencyDetails, RadarTerritoryRow, RadarSignalRow, RadarTimelineRow,
} from "./competitionRadarFormat";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export interface RefreshRadarResult {
  agenciesScanned: number;
  relationshipsCreated: number;
  territoriesCalculated: number;
  scoresCalculated: number;
  signalsCreated: number;
  reportsGenerated: number;
  errors: number;
  status: DailyAgencyIntelligenceResult["status"];
  message: string;
}

const stepNum = (r: DailyAgencyIntelligenceResult, name: AgencyJobStepName, key: string): number =>
  Number(r.steps.find((s) => s.name === name)?.summary[key] ?? 0);

function messageFor(r: DailyAgencyIntelligenceResult): string {
  if (r.status === "success") return "המודיעין התחרותי עודכן בהצלחה.";
  if (r.status === "partial_success") return `העדכון הושלם חלקית (${r.summary.stepsFailed} שלבים נכשלו). חלק מהנתונים עשויים להיות חסרים.`;
  return "העדכון נכשל בשלב קריטי. חלק מהמודיעין לא עודכן — נסה שוב מאוחר יותר.";
}

/**
 * Refresh the competition radar by running the orchestrated daily agency
 * intelligence pipeline (idempotent, logged, severity-aware). Surfaces running /
 * success / partial_success / failed via the returned status + message.
 */
export async function refreshCompetitionRadarIntelligence(): Promise<Result<RefreshRadarResult>> {
  try {
    const org = await currentOrgId();
    const r = await runDailyAgencyIntelligenceJob(org, { maxAgencies: 60 });
    return {
      ok: true,
      data: {
        agenciesScanned: stepNum(r, "build_knowledge_graph", "agenciesScanned"),
        relationshipsCreated: stepNum(r, "build_knowledge_graph", "relationshipsCreated"),
        territoriesCalculated: stepNum(r, "calculate_territory_stats", "territoriesCalculated"),
        scoresCalculated: stepNum(r, "calculate_scores", "scoresCalculated"),
        signalsCreated: stepNum(r, "detect_signals", "signalsCreated"),
        reportsGenerated: stepNum(r, "generate_reports", "reportsCreated") + stepNum(r, "generate_reports", "reportsUpdated"),
        errors: r.summary.stepsFailed,
        status: r.status,
        message: messageFor(r),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getCompetitionRadarAgencyDetailsAction(agencyId: string): Promise<Result<RadarAgencyDetails | null>> {
  try { return { ok: true, data: await getCompetitionRadarAgencyDetails(agencyId) }; }
  catch (e) { return fail(e); }
}

export async function getCompetitionRadarTerritoriesAction(filters: RadarTerritoryFilters): Promise<Result<RadarTerritoryRow[]>> {
  try { return { ok: true, data: await getCompetitionRadarTerritories(filters) }; }
  catch (e) { return fail(e); }
}

export async function getCompetitionRadarSignalsAction(filters: RadarSignalFilters): Promise<Result<RadarSignalRow[]>> {
  try { return { ok: true, data: await getCompetitionRadarSignals(filters) }; }
  catch (e) { return fail(e); }
}

export async function getCompetitionRadarTimelineAction(): Promise<Result<RadarTimelineRow[]>> {
  try { return { ok: true, data: await getCompetitionRadarTimeline() }; }
  catch (e) { return fail(e); }
}
