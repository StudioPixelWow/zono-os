// ============================================================================
// 🗂️ Research Jobs — persistence (server-only). 26.4.15.
// ----------------------------------------------------------------------------
// Persists jobs to brokerage_research_jobs (service-role writes). Degrades
// gracefully if the migration hasn't been applied yet (returns a clear flag so
// the UI can tell the user to run it) — never throws to the caller.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normCityKb, makeCityMatch } from "../brokerage-knowledge";
import { stageProgress, type ResearchJob, type JobStatus, type JobStage, type JobCheckpoints, type JobStageLog, type CreateJobOptions, type ResearchDepth } from "./types";
export { stageProgress };

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const TABLE = "brokerage_research_jobs";
const isMissingTable = (msg: string) => /does not exist|relation .* does not exist|schema cache|could not find the table/i.test(msg);

export class JobsTableMissing extends Error { constructor() { super("brokerage_research_jobs table missing — run the 26.4.15 migration."); } }

function rowToJob(r: Row): ResearchJob {
  const cp = (r.checkpoints ?? {}) as JobCheckpoints;
  return {
    id: s(r.id), organizationId: s(r.organization_id) || null,
    city: s(r.city), normalizedCity: s(r.normalized_city),
    status: (s(r.status) || "queued") as JobStatus, depth: (s(r.depth) || "standard") as ResearchDepth,
    currentStage: (s(r.current_stage) || "INIT") as JobStage,
    progressPercent: n(r.progress_percent),
    searchesCompleted: n(r.searches_completed), candidatesFound: n(r.candidates_found),
    candidatesSaved: n(r.candidates_saved), candidatesVerified: n(r.candidates_verified),
    candidatesResearching: n(r.candidates_researching), candidatesWaitingForEvidence: n(r.candidates_waiting_for_evidence),
    candidatesRejected: n(r.candidates_rejected),
    errors: Array.isArray(r.errors) ? (r.errors as ResearchJob["errors"]) : [],
    checkpoints: { stagesDone: Array.isArray(cp.stagesDone) ? cp.stagesDone : [], searchStageIndex: cp.searchStageIndex, verifiedIds: cp.verifiedIds, discoveredCount: cp.discoveredCount },
    logs: Array.isArray(r.logs) ? (r.logs as JobStageLog[]) : [],
    resultSummary: (r.result_summary ?? null) as Record<string, unknown> | null,
    startedAt: s(r.started_at) || null, updatedAt: s(r.updated_at) || new Date().toISOString(),
    completedAt: s(r.completed_at) || null, createdBy: s(r.created_by) || null,
  };
}

/** Create a queued job. Returns null if the table is missing (caller handles). */
export async function insertJob(orgId: string | null, cityRaw: string, opts: CreateJobOptions): Promise<ResearchJob | null> {
  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await db.from(TABLE as never).insert({
    organization_id: orgId, city: cityRaw.trim(), normalized_city: normCityKb(cityRaw),
    status: "queued", depth: opts.depth ?? "standard", current_stage: "INIT", progress_percent: 0,
    checkpoints: { stagesDone: [] }, errors: [], logs: [], created_by: opts.createdBy ?? null, updated_at: nowIso,
  } as never).select("*").maybeSingle();
  if (error) { if (isMissingTable(error.message)) return null; throw new Error(error.message); }
  return data ? rowToJob(data as Row) : null;
}

/** Load one job (null if not found / table missing). */
export async function loadJob(jobId: string): Promise<ResearchJob | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from(TABLE as never).select("*").eq("id", jobId).maybeSingle();
  if (error) { if (isMissingTable(error.message)) return null; throw new Error(error.message); }
  return data ? rowToJob(data as Row) : null;
}

/** The newest active/recent job for an org+city (for resume / polling). */
export async function latestJobForCity(orgId: string | null, cityRaw: string): Promise<ResearchJob | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from(TABLE as never).select("*")
    .eq("normalized_city", normCityKb(cityRaw)).order("updated_at", { ascending: false }).limit(1);
  if (error) { if (isMissingTable(error.message)) return null; throw new Error(error.message); }
  const rows = (data ?? []) as Row[];
  const filtered = orgId ? rows.filter((r) => !s(r.organization_id) || s(r.organization_id) === orgId) : rows;
  return filtered.length ? rowToJob(filtered[0]) : null;
}

export interface JobPatch {
  status?: JobStatus; currentStage?: JobStage; progressPercent?: number;
  counts?: Partial<Pick<ResearchJob, "searchesCompleted" | "candidatesFound" | "candidatesSaved" | "candidatesVerified" | "candidatesResearching" | "candidatesWaitingForEvidence" | "candidatesRejected">>;
  checkpoints?: JobCheckpoints; appendLog?: JobStageLog; appendError?: { stage: JobStage; message: string };
  resultSummary?: Record<string, unknown>; markStarted?: boolean; markCompleted?: boolean;
}

/** Persist a checkpoint/patch to a job (never throws to caller of the engine). */
export async function patchJob(job: ResearchJob, patch: JobPatch): Promise<ResearchJob> {
  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const upd: Row = { updated_at: nowIso };
  if (patch.status) upd.status = patch.status;
  if (patch.currentStage) upd.current_stage = patch.currentStage;
  if (patch.progressPercent != null) upd.progress_percent = patch.progressPercent;
  if (patch.checkpoints) upd.checkpoints = patch.checkpoints as never;
  if (patch.resultSummary) upd.result_summary = patch.resultSummary as never;
  if (patch.markStarted && !job.startedAt) upd.started_at = nowIso;
  if (patch.markCompleted) upd.completed_at = nowIso;
  const c = patch.counts;
  if (c) {
    if (c.searchesCompleted != null) upd.searches_completed = c.searchesCompleted;
    if (c.candidatesFound != null) upd.candidates_found = c.candidatesFound;
    if (c.candidatesSaved != null) upd.candidates_saved = c.candidatesSaved;
    if (c.candidatesVerified != null) upd.candidates_verified = c.candidatesVerified;
    if (c.candidatesResearching != null) upd.candidates_researching = c.candidatesResearching;
    if (c.candidatesWaitingForEvidence != null) upd.candidates_waiting_for_evidence = c.candidatesWaitingForEvidence;
    if (c.candidatesRejected != null) upd.candidates_rejected = c.candidatesRejected;
  }
  if (patch.appendLog) upd.logs = [...job.logs, patch.appendLog].slice(-40) as never;
  if (patch.appendError) upd.errors = [...job.errors, { ...patch.appendError, at: nowIso }].slice(-40) as never;
  const { data, error } = await db.from(TABLE as never).update(upd as never).eq("id", job.id).select("*").maybeSingle();
  if (error) { if (isMissingTable(error.message)) throw new JobsTableMissing(); throw new Error(error.message); }
  return data ? rowToJob(data as Row) : { ...job, ...patchToLocal(job, patch, nowIso) };
}

/** Local mirror of a patch (used if the update returned no row). */
function patchToLocal(job: ResearchJob, patch: JobPatch, nowIso: string): Partial<ResearchJob> {
  return {
    status: patch.status ?? job.status, currentStage: patch.currentStage ?? job.currentStage,
    progressPercent: patch.progressPercent ?? job.progressPercent,
    checkpoints: patch.checkpoints ?? job.checkpoints, updatedAt: nowIso,
    logs: patch.appendLog ? [...job.logs, patch.appendLog] : job.logs,
  };
}

export interface ResearchingCandidate {
  id: string; officeName: string; normalizedName: string; normalizedBrand: string;
  brandNetwork: string | null; systemVerified: boolean;
}

/** Load un-verified AI/agent candidates for a city (the VERIFY drain queue). */
export async function loadResearchingCandidates(cityRaw: string): Promise<ResearchingCandidate[]> {
  const db = createServiceRoleClient();
  const match = makeCityMatch(cityRaw);
  const { data, error } = await db.from("brokerage_office_candidates" as never)
    .select("id,office_name,normalized_name,normalized_brand,brand_network,city,status,suggested_by,evidence").limit(20000);
  if (error) return [];
  const AI = new Set(["ai_candidate_seed", "brokerage_research_agent"]);
  return ((data ?? []) as Row[])
    .filter((r) => AI.has(s(r.suggested_by)) && match(r.city) && s(r.status) !== "rejected" && s(r.status) !== "verified")
    .map((r) => {
      const ev = Array.isArray(r.evidence) ? (r.evidence[0] as Row | undefined) : undefined;
      return {
        id: s(r.id), officeName: s(r.office_name), normalizedName: s(r.normalized_name),
        normalizedBrand: s(r.normalized_brand) || "independent", brandNetwork: s(r.brand_network) || null,
        systemVerified: !!(ev && ev.system_verified === true),
      };
    });
}

