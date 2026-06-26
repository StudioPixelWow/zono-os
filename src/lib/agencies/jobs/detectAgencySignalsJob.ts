// ============================================================================
// ZONO — Detect Agency Signals batch job (Phase 26.6, SERVER-ONLY).
// Runs the signal+timeline intelligence detector for every agency in the org.
// Rules: idempotent · safe pagination · period-aware · dedupe-aware · no
// destructive deletion · logs counts.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { detectAgencySignals } from "../intelligence/agencyTimelineIntelligence";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";

export interface DetectSignalsJobOptions {
  agencyId?: string;
  period?: number;
  pageSize?: number;
  cursor?: string | null;
  maxAgencies?: number;
}

export interface DetectSignalsJobResult {
  agenciesScanned: number;
  signalsCreated: number;
  signalsUpdated: number;
  signalsResolved: number;
  timelineEventsCreated: number;
  duplicatesSkipped: number;
  errors: { agencyId: string; message: string }[];
  nextCursor: string | null;
  done: boolean;
}

function emptyResult(): DetectSignalsJobResult {
  return {
    agenciesScanned: 0, signalsCreated: 0, signalsUpdated: 0, signalsResolved: 0,
    timelineEventsCreated: 0, duplicatesSkipped: 0, errors: [], nextCursor: null, done: true,
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

export async function detectAgencySignalsJob(opts: DetectSignalsJobOptions = {}): Promise<DetectSignalsJobResult> {
  const period = opts.period ?? DEFAULT_TERRITORY_PERIOD;
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));
  const maxAgencies = Math.max(1, opts.maxAgencies ?? 400);
  const result = emptyResult();
  result.done = false;

  const accumulate = (r: Awaited<ReturnType<typeof detectAgencySignals>>) => {
    result.agenciesScanned++;
    result.signalsCreated += r.signalsCreated;
    result.signalsUpdated += r.signalsUpdated;
    result.duplicatesSkipped += r.duplicatesSkipped;
    result.timelineEventsCreated += r.timelineEventsCreated;
  };

  if (opts.agencyId) {
    try { accumulate(await detectAgencySignals(opts.agencyId, period)); }
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
      try { accumulate(await detectAgencySignals(agencyId, period)); }
      catch (e) { result.errors.push({ agencyId, message: e instanceof Error ? e.message : String(e) }); }
      cursor = agencyId; processed++;
    }
    if (page.length < pageSize) { result.done = true; cursor = null; break; }
  }

  result.nextCursor = result.done ? null : cursor;
  logResult(result, period);
  return result;
}

function logResult(r: DetectSignalsJobResult, period: number): void {
  if (typeof console === "undefined") return;
  console.info("[detect-agency-signals-job]", { period, ...r, errors: r.errors.length });
}
