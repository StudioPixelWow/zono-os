"use server";
// ============================================================================
// ZONO — Competition Radar server actions (Phase 26.8). Thin, typed wrappers.
// The refresh action runs the EXISTING agency intelligence jobs (26.3–26.7) in
// sequence, capped so it never blocks the UI for too long, isolating failures.
// Read-only otherwise. No destructive actions.
// ============================================================================
import {
  getCompetitionRadarAgencyDetails, getCompetitionRadarTerritories, getCompetitionRadarSignals,
  getCompetitionRadarTimeline,
  type RadarTerritoryFilters, type RadarSignalFilters,
} from "./competitionRadarQueries";
import { buildAgencyKnowledgeGraphJob } from "../jobs/buildAgencyKnowledgeGraphJob";
import { calculateAgencyTerritoryStatsJob } from "../jobs/calculateAgencyTerritoryStatsJob";
import { calculateAgencyScoresJob } from "../jobs/calculateAgencyScoresJob";
import { detectAgencySignalsJob } from "../jobs/detectAgencySignalsJob";
import { generateAgencyReportsJob } from "../jobs/generateAgencyReportsJob";
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
  message: string;
}

/**
 * Refresh the competition radar by re-running the agency intelligence pipeline.
 * Safe + idempotent: each job upserts and isolates failures; capped to a bounded
 * batch so the request returns promptly. (Agency identity resolution runs in its
 * own flow and is not triggered here.)
 */
export async function refreshCompetitionRadarIntelligence(): Promise<Result<RefreshRadarResult>> {
  const out: RefreshRadarResult = {
    agenciesScanned: 0, relationshipsCreated: 0, territoriesCalculated: 0,
    scoresCalculated: 0, signalsCreated: 0, reportsGenerated: 0, errors: 0,
    message: "",
  };
  const cap = { maxAgencies: 60 };
  try {
    const graph = await buildAgencyKnowledgeGraphJob(cap).catch((e) => { out.errors++; console.error("[radar] graph job", e); return null; });
    if (graph) { out.agenciesScanned = graph.agenciesScanned; out.relationshipsCreated = graph.relationshipsCreated; }

    const terr = await calculateAgencyTerritoryStatsJob(cap).catch((e) => { out.errors++; console.error("[radar] territory job", e); return null; });
    if (terr) out.territoriesCalculated = terr.territoriesCalculated;

    const scores = await calculateAgencyScoresJob(cap).catch((e) => { out.errors++; console.error("[radar] scores job", e); return null; });
    if (scores) out.scoresCalculated = scores.scoresCalculated;

    const signals = await detectAgencySignalsJob(cap).catch((e) => { out.errors++; console.error("[radar] signals job", e); return null; });
    if (signals) out.signalsCreated = signals.signalsCreated;

    const reports = await generateAgencyReportsJob(cap).catch((e) => { out.errors++; console.error("[radar] reports job", e); return null; });
    if (reports) out.reportsGenerated = reports.reportsCreated + reports.reportsUpdated;

    out.message = out.errors === 0
      ? "המודיעין התחרותי עודכן בהצלחה."
      : `העדכון הושלם חלקית (${out.errors} שגיאות). חלק מהנתונים עשויים להיות חסרים.`;
    return { ok: true, data: out };
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
