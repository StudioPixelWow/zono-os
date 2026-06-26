// ============================================================================
// ZONO — PHASE 26.11: Agency intelligence job logger (SERVER-ONLY).
// Structured, secret-redacted logs + persistence of pipeline runs to
// agency_intelligence_job_runs (running → final). Org-scoped; RLS enforces.
// All persistence is best-effort: a logging hiccup never breaks the pipeline.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redactMessage } from "./agencyJobTypes";
import type { AgencyJobStatus, AgencyJobStepName, DailyAgencyIntelligenceResult } from "./agencyJobTypes";

type Obj = Record<string, unknown>;
const SECRET_KEY = /secret|token|password|api[_-]?key|authorization|bearer/i;

/** Deep-redact secret-looking keys/values from a structured object before logging/persisting. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value as Obj)) {
      if (SECRET_KEY.test(k)) out[k] = "***";
      else if (typeof v === "string") out[k] = redactMessage(v);
      else out[k] = redact(v);
    }
    return out;
  }
  if (typeof value === "string") return redactMessage(value);
  return value;
}

function structuredLog(event: Obj): void {
  try { console.log(`[agency-intelligence] ${JSON.stringify(redact(event))}`); } catch { /* never throw from logging */ }
}

export function logStepStart(organizationId: string, name: AgencyJobStepName): void {
  structuredLog({ at: "step_start", organizationId, step: name, ts: new Date().toISOString() });
}
export function logStepEnd(organizationId: string, name: AgencyJobStepName, status: string, durationMs: number, error?: string): void {
  structuredLog({ at: "step_end", organizationId, step: name, status, durationMs, error: error ?? null });
}

const COLS = "id,organization_id,job_name,status,started_at,finished_at,duration_ms,result,error_message,created_at";

/** Create a 'running' run row; returns its id, or null if persistence is unavailable. */
export async function createRunRow(organizationId: string, jobName: string): Promise<string | null> {
  try {
    const db = await createClient();
    const { data, error } = await db.from("agency_intelligence_job_runs").insert({
      organization_id: organizationId, job_name: jobName, status: "running", started_at: new Date().toISOString(),
    } as never).select("id").single();
    if (error) { structuredLog({ at: "run_row_insert_failed", error: error.message }); return null; }
    return (data as { id: string }).id;
  } catch (e) { structuredLog({ at: "run_row_insert_threw", error: e instanceof Error ? e.message : String(e) }); return null; }
}

/** Finalize a run row with status + redacted structured result. Best-effort. */
export async function finishRunRow(id: string | null, result: DailyAgencyIntelligenceResult): Promise<void> {
  if (!id) return;
  try {
    const db = await createClient();
    await db.from("agency_intelligence_job_runs").update({
      status: result.status, finished_at: result.finishedAt, duration_ms: result.durationMs,
      result: redact(result) as never, error_message: result.errors.length ? redactMessage(result.errors.join(" | ")).slice(0, 1000) : null,
    } as never).eq("id", id);
  } catch (e) { structuredLog({ at: "run_row_finish_threw", error: e instanceof Error ? e.message : String(e) }); }
}

export interface JobRunRecord {
  id: string; jobName: string; status: AgencyJobStatus; startedAt: string | null; finishedAt: string | null;
  durationMs: number | null; result: Record<string, unknown>; errorMessage: string | null; createdAt: string;
}
function toRecord(r: Obj): JobRunRecord {
  return {
    id: r.id as string, jobName: r.job_name as string, status: (r.status as AgencyJobStatus) ?? "queued",
    startedAt: (r.started_at as string) ?? null, finishedAt: (r.finished_at as string) ?? null,
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    result: (r.result && typeof r.result === "object" ? r.result : {}) as Record<string, unknown>,
    errorMessage: (r.error_message as string) ?? null, createdAt: r.created_at as string,
  };
}

export async function listRuns(organizationId: string, limit = 30): Promise<JobRunRecord[]> {
  const db = await createClient();
  const { data } = await db.from("agency_intelligence_job_runs").select(COLS)
    .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map(toRecord);
}

export async function latestRun(organizationId: string): Promise<JobRunRecord | null> {
  const db = await createClient();
  const { data } = await db.from("agency_intelligence_job_runs").select(COLS)
    .eq("organization_id", organizationId).eq("job_name", "daily_agency_intelligence")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toRecord(data as Obj) : null;
}
