// ============================================================================
// ZONO — Agency Scores batch job (Phase 26.5, SERVER-ONLY).
// Recomputes intelligence scores for every agency in the org. Rules: idempotent ·
// period-aware · safe pagination · logs counts · no destructive updates (upsert).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { calculateAgencyScores } from "../scoring/agencyScoringService";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";

export interface AgencyScoresJobOptions {
  agencyId?: string;
  period?: number;
  pageSize?: number;
  cursor?: string | null;
  maxAgencies?: number;
}

export interface AgencyScoresJobResult {
  agenciesScanned: number;
  scoresCalculated: number;
  highThreatDetected: number;
  signalsCreated: number;
  timelineEventsCreated: number;
  lowConfidenceScores: number;
  errors: { agencyId: string; message: string }[];
  nextCursor: string | null;
  done: boolean;
}

function emptyResult(): AgencyScoresJobResult {
  return {
    agenciesScanned: 0, scoresCalculated: 0, highThreatDetected: 0, signalsCreated: 0,
    timelineEventsCreated: 0, lowConfidenceScores: 0, errors: [], nextCursor: null, done: true,
  };
}

async function fetchAgencyPage(cursor: string | null, pageSize: number): Promise<string[]> {
  const org = await currentOrgId();
  const db = await createClient();
  let req = db.from("agencies").select("id").eq("organization_id", org).eq("active", true).order("id", { ascending: true }).limit(pageSize);
  if (cursor) req = req.gt("id", cursor);
  const { data } = await req;
  return ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
}

export async function calculateAgencyScoresJob(opts: AgencyScoresJobOptions = {}): Promise<AgencyScoresJobResult> {
  const period = opts.period ?? DEFAULT_TERRITORY_PERIOD;
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));
  const maxAgencies = Math.max(1, opts.maxAgencies ?? 400);
  const result = emptyResult();
  result.done = false;

  const accumulate = (r: Awaited<ReturnType<typeof calculateAgencyScores>>) => {
    result.agenciesScanned++;
    if (r.scored) result.scoresCalculated++;
    if (r.highThreat) result.highThreatDetected++;
    if (r.lowConfidence) result.lowConfidenceScores++;
    result.signalsCreated += r.signalsCreated;
    result.timelineEventsCreated += r.timelineEventsCreated;
  };

  if (opts.agencyId) {
    try { accumulate(await calculateAgencyScores(opts.agencyId, period)); }
    catch (e) { result.errors.push({ agencyId: opts.agencyId, message: e instanceof Error ? e.message : String(e) }); }
    result.done = true; result.nextCursor = null;
    logResult(result, period); return result;
  }

  let cursor: string | null = opts.cursor ?? null;
  let processed = 0;
  while (processed < maxAgencies) {
    const page = await fetchAgencyPage(cursor, Math.min(pageSize, maxAgencies - processed));
    if (page.length === 0) { result.done = true; cursor = null; break; }
    for (const agencyId of page) {
      try { accumulate(await calculateAgencyScores(agencyId, period)); }
      catch (e) { result.errors.push({ agencyId, message: e instanceof Error ? e.message : String(e) }); }
      cursor = agencyId; processed++;
    }
    if (page.length < pageSize) { result.done = true; cursor = null; break; }
  }

  result.nextCursor = result.done ? null : cursor;
  logResult(result, period);
  return result;
}

function logResult(r: AgencyScoresJobResult, period: number): void {
  if (typeof console === "undefined") return;
  console.info("[agency-scores-job]", { period, ...r, errors: r.errors.length });
}
