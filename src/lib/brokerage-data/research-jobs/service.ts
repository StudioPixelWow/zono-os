// ============================================================================
// 🗂️ Persistent Background Research Jobs™ — service (server-only). 26.4.15.
// Official entry points. Creating a job returns immediately; running processes
// as much as fits an execution budget, then leaves the job "waiting" to resume.
// Never throws to the UI (except a clear "run migration" signal).
// ============================================================================
import "server-only";
import { insertJob, loadJob, latestJobForCity, patchJob, JobsTableMissing } from "./repository";
import { runResearchJob } from "./engine";
import type { ResearchJob, CreateJobOptions } from "./types";

export interface JobResult { ok: boolean; job?: ResearchJob | null; error?: string; migrationRequired?: boolean }

/** Create a queued research job and return immediately (no work done yet). */
export async function createBrokerageResearchJob(orgId: string | null, city: string, options: CreateJobOptions = {}): Promise<JobResult> {
  try {
    const job = await insertJob(orgId, city, options);
    if (!job) return { ok: false, migrationRequired: true, error: "טבלת המשרות אינה קיימת — יש להריץ את מיגרציית 26.4.15." };
    return { ok: true, job };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "יצירת משרה נכשלה." }; }
}

/** Process a job within a budget, then return its (possibly waiting) status. */
export async function runBrokerageResearchJob(jobId: string, executionBudgetMs = 20000): Promise<JobResult> {
  try {
    const job = await runResearchJob(jobId, executionBudgetMs);
    return { ok: true, job };
  } catch (e) {
    if (e instanceof JobsTableMissing) return { ok: false, migrationRequired: true, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "הרצת המשרה נכשלה." };
  }
}

/** Resume a waiting/queued job from its last checkpoint. */
export async function resumeBrokerageResearchJob(jobId: string, executionBudgetMs = 20000): Promise<JobResult> {
  const existing = await loadJob(jobId).catch(() => null);
  if (existing && ["completed", "cancelled", "failed"].includes(existing.status)) return { ok: true, job: existing };
  return runBrokerageResearchJob(jobId, executionBudgetMs);
}

/** Read job status (for polling). */
export async function getBrokerageResearchJobStatus(jobId: string): Promise<JobResult> {
  try { return { ok: true, job: await loadJob(jobId) }; }
  catch (e) { if (e instanceof JobsTableMissing) return { ok: false, migrationRequired: true }; return { ok: false, error: "טעינת סטטוס נכשלה." }; }
}

/** Newest job for a city (so the UI can re-attach to an in-flight job). */
export async function getLatestCityResearchJob(orgId: string | null, city: string): Promise<JobResult> {
  try { return { ok: true, job: await latestJobForCity(orgId, city) }; }
  catch { return { ok: true, job: null }; }
}

/** Cancel a running/waiting job. */
export async function cancelBrokerageResearchJob(jobId: string): Promise<JobResult> {
  try {
    const job = await loadJob(jobId);
    if (!job) return { ok: false, error: "המשרה לא נמצאה." };
    if (["completed", "cancelled", "failed"].includes(job.status)) return { ok: true, job };
    return { ok: true, job: await patchJob(job, { status: "cancelled" }) };
  } catch (e) { if (e instanceof JobsTableMissing) return { ok: false, migrationRequired: true }; return { ok: false, error: "ביטול נכשל." }; }
}
