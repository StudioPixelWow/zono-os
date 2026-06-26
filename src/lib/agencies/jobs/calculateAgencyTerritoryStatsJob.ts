// ============================================================================
// ZONO — Agency Territory Stats batch job (Phase 26.4, SERVER-ONLY).
// Recomputes dominance/momentum stats for every agency in the org at one period.
// Rules: idempotent · period-aware · safe pagination · resumable (cursor) · logs
// counts · no destructive deletion (upsert only).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { calculateAgencyTerritoryStats } from "../territory/agencyTerritoryService";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import type { TerritoryPeriodDays } from "../territory/agencyTerritoryTypes";

export interface TerritoryStatsJobOptions {
  agencyId?: string;
  period?: TerritoryPeriodDays;
  pageSize?: number;
  cursor?: string | null;
  maxAgencies?: number;
}

export interface TerritoryStatsJobResult {
  agenciesScanned: number;
  territoriesCalculated: number;
  dominanceChanges: number;
  opportunitiesDetected: number;
  signalsCreated: number;
  timelineEventsCreated: number;
  errors: { agencyId: string; message: string }[];
  nextCursor: string | null;
  done: boolean;
}

function emptyResult(): TerritoryStatsJobResult {
  return {
    agenciesScanned: 0, territoriesCalculated: 0, dominanceChanges: 0, opportunitiesDetected: 0,
    signalsCreated: 0, timelineEventsCreated: 0, errors: [], nextCursor: null, done: true,
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

export async function calculateAgencyTerritoryStatsJob(opts: TerritoryStatsJobOptions = {}): Promise<TerritoryStatsJobResult> {
  const period = opts.period ?? DEFAULT_TERRITORY_PERIOD;
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));
  const maxAgencies = Math.max(1, opts.maxAgencies ?? 400);
  const result = emptyResult();
  result.done = false;

  const accumulate = (r: Awaited<ReturnType<typeof calculateAgencyTerritoryStats>>) => {
    result.agenciesScanned++;
    result.territoriesCalculated += r.territoriesCalculated;
    result.dominanceChanges += r.dominanceChanges;
    result.opportunitiesDetected += r.opportunitiesDetected;
    result.signalsCreated += r.signalsCreated;
    result.timelineEventsCreated += r.timelineEventsCreated;
  };

  if (opts.agencyId) {
    try { accumulate(await calculateAgencyTerritoryStats(opts.agencyId, period)); }
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
      try { accumulate(await calculateAgencyTerritoryStats(agencyId, period)); }
      catch (e) { result.errors.push({ agencyId, message: e instanceof Error ? e.message : String(e) }); }
      cursor = agencyId; processed++;
    }
    if (page.length < pageSize) { result.done = true; cursor = null; break; }
  }

  result.nextCursor = result.done ? null : cursor;
  logResult(result, period);
  return result;
}

function logResult(r: TerritoryStatsJobResult, period: number): void {
  if (typeof console === "undefined") return;
  console.info("[agency-territory-stats-job]", { period, ...r, errors: r.errors.length });
}
