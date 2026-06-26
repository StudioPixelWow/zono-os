// ============================================================================
// ZONO — Generate Agency Reports batch job (Phase 26.7, SERVER-ONLY).
// Generates the full intelligence report for every agency in the org. Rules:
// idempotent by agency + report_type + period · safe pagination · no fake
// content (uses real snapshots) · logs counts.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { generateFullAgencyReport } from "../reports/agencyReportService";
import { getLatestReport } from "../reports/agencyReportRepository";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";

export interface AgencyReportsJobOptions {
  agencyId?: string;
  period?: number;
  pageSize?: number;
  cursor?: string | null;
  maxAgencies?: number;
}

export interface AgencyReportsJobResult {
  agenciesScanned: number;
  reportsCreated: number;
  reportsUpdated: number;
  lowConfidenceReports: number;
  errors: { agencyId: string; message: string }[];
  nextCursor: string | null;
  done: boolean;
}

function emptyResult(): AgencyReportsJobResult {
  return { agenciesScanned: 0, reportsCreated: 0, reportsUpdated: 0, lowConfidenceReports: 0, errors: [], nextCursor: null, done: true };
}

async function fetchAgencyPage(cursor: string | null, pageSize: number): Promise<string[]> {
  const org = await currentOrgId();
  const db = await createClient();
  let req = db.from("agencies").select("id").eq("organization_id", org).eq("active", true).order("id", { ascending: true }).limit(pageSize);
  if (cursor) req = req.gt("id", cursor);
  const { data } = await req;
  return ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
}

export async function generateAgencyReportsJob(opts: AgencyReportsJobOptions = {}): Promise<AgencyReportsJobResult> {
  const period = opts.period ?? DEFAULT_TERRITORY_PERIOD;
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));
  const maxAgencies = Math.max(1, opts.maxAgencies ?? 400);
  const result = emptyResult();
  result.done = false;

  const run = async (agencyId: string) => {
    // Idempotent: a same-period report already present counts as an update.
    const existing = await getLatestReport(agencyId, "full_report");
    const rep = await generateFullAgencyReport(agencyId, period);
    result.agenciesScanned++;
    if (!rep) return;
    const sameWindow = existing && existing.periodStart === rep.periodStart && existing.periodEnd === rep.periodEnd;
    if (sameWindow) result.reportsUpdated++; else result.reportsCreated++;
    if ((rep.dataConfidence ?? 100) < 40) result.lowConfidenceReports++;
  };

  if (opts.agencyId) {
    try { await run(opts.agencyId); }
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
      try { await run(agencyId); }
      catch (e) { result.errors.push({ agencyId, message: e instanceof Error ? e.message : String(e) }); }
      cursor = agencyId; processed++;
    }
    if (page.length < pageSize) { result.done = true; cursor = null; break; }
  }

  result.nextCursor = result.done ? null : cursor;
  logResult(result, period);
  return result;
}

function logResult(r: AgencyReportsJobResult, period: number): void {
  if (typeof console === "undefined") return;
  console.info("[generate-agency-reports-job]", { period, ...r, errors: r.errors.length });
}
