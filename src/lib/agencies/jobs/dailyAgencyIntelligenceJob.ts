// ============================================================================
// ZONO — PHASE 26.11: Daily Agency Intelligence Job™ — entry + service API.
// One orchestrated pipeline that runs every internal agency-intelligence step in
// the correct order. Safe: idempotent, org-scoped, retry-safe, no destructive
// deletes, no fake data, no external scraping. Read accessors expose the run log.
// ============================================================================
import "server-only";
import { runAgencyJobPipeline, type OrchestratorOptions } from "./agencyJobOrchestrator";
import { listRuns, latestRun, type JobRunRecord } from "./agencyJobLogger";
import type { DailyAgencyIntelligenceResult } from "./agencyJobTypes";

/** Run the full daily agency-intelligence pipeline for an organization. */
export async function runDailyAgencyIntelligenceJob(organizationId: string, opts: OrchestratorOptions = {}): Promise<DailyAgencyIntelligenceResult> {
  return runAgencyJobPipeline(organizationId, opts);
}

/** Recent pipeline run history (newest first). */
export async function getAgencyIntelligenceJobRuns(organizationId: string, limit = 30): Promise<JobRunRecord[]> {
  return listRuns(organizationId, limit);
}

/** The most recent daily pipeline run, or null. */
export async function getLatestAgencyIntelligenceJobRun(organizationId: string): Promise<JobRunRecord | null> {
  return latestRun(organizationId);
}
