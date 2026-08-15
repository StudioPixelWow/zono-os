// ============================================================================
// 📟 City Directory observability — operator-only run ledger (server-only).
// Reuses the canonical `zono_orchestrator_runs` table (NO migration) with
// source='madlan-directory-refresh'. Lifecycle running→terminal + stale-run
// recovery, exactly like the hourly market-watch. No customer debug controls,
// no secrets, no raw provider payloads.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CityDirectorySeedResult } from "./types";

export const DIRECTORY_RUN_SOURCE = "madlan-directory-refresh";
const STALE_MS = 20 * 60 * 1000;

type DB = ReturnType<typeof createServiceRoleClient>;
const nowIso = () => new Date().toISOString();

/** Open a running directory-refresh run row; returns its id (or null best-effort). */
export async function openDirectoryRun(db: DB, orgId: string | null, locality: string, trigger: string): Promise<string | null> {
  try {
    const { data } = await db.from("zono_orchestrator_runs" as never).insert({
      organization_id: orgId, trigger, source: DIRECTORY_RUN_SOURCE, status: "running",
      started_at: nowIso(), steps: [], metadata: { job_type: DIRECTORY_RUN_SOURCE, locality },
    } as never).select("id").single();
    return (data as { id: string } | null)?.id ?? null;
  } catch { return null; }
}

/** Finalize a directory-refresh run to a terminal state with safe metrics. */
export async function finishDirectoryRun(db: DB, id: string | null, startedAt: number, result: CityDirectorySeedResult): Promise<void> {
  if (!id) return;
  const status = result.status === "success" ? "success"
    : result.status === "partial" ? "partial"
    : result.status === "provider_not_configured" || result.status === "provider_blocked" ? "blocked"
    : "failed";
  try {
    await db.from("zono_orchestrator_runs" as never).update({
      status, finished_at: nowIso(), duration_ms: Date.now() - startedAt,
      error: result.errors[0] ?? result.reason ?? null,
      metadata: {
        job_type: DIRECTORY_RUN_SOURCE, locality: result.locality, source: result.source,
        provider_status: result.status,
        offices_discovered: result.officesDiscovered, agents_discovered: result.agentsDiscovered,
        relationships_discovered: result.relationshipsDiscovered, agents_without_office: result.agentsWithoutOffice,
        offices_inserted: result.officesInserted, offices_updated: result.officesUpdated,
        agents_inserted: result.agentsInserted, agents_updated: result.agentsUpdated,
        relationships_persisted: result.relationshipsPersisted,
        offices_duplicates_merged: result.officesDuplicatesMerged, agents_duplicates_merged: result.agentsDuplicatesMerged,
        pages_fetched: result.pagesFetched, source_exhausted: result.sourceExhausted, error_count: result.errors.length,
      },
    } as never).eq("id", id);
  } catch { /* best-effort observability */ }
}

/** Reconcile any directory run stuck `running` past the window → timed_out. */
export async function closeStuckDirectoryRuns(db: DB): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const { data } = await db.from("zono_orchestrator_runs" as never)
      .update({ status: "timed_out", finished_at: nowIso(), error: "stale madlan-directory-refresh run auto-recovered" } as never)
      .eq("source", DIRECTORY_RUN_SOURCE).eq("status", "running").lt("started_at", cutoff).select("id");
    return ((data ?? []) as unknown[]).length;
  } catch { return 0; }
}

export interface DirectoryRunStatus {
  id: string;
  locality: string | null;
  status: string;            // running | success | partial | blocked | failed | timed_out
  providerStatus: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  officesDiscovered: number;
  agentsDiscovered: number;
  relationshipsDiscovered: number;
  agentsWithoutOffice: number;
  error: string | null;
  isStale: boolean;          // running but past the heartbeat threshold → "delayed"
}

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const str = (v: unknown): string | null => (typeof v === "string" ? v : v == null ? null : String(v));

/** Latest directory run for a locality (or the org's latest). Powers the UI
 *  status panel — background-safe: reading it never restarts a job. */
export async function getLatestDirectoryRun(orgId: string | null, locality?: string): Promise<DirectoryRunStatus | null> {
  const db = createServiceRoleClient();
  try {
    let q = db.from("zono_orchestrator_runs" as never)
      .select("id,status,started_at,finished_at,duration_ms,error,metadata,organization_id")
      .eq("source", DIRECTORY_RUN_SOURCE).order("started_at", { ascending: false }).limit(50);
    if (orgId) q = q.eq("organization_id", orgId);
    const { data } = await q;
    const rows = (data ?? []) as Record<string, unknown>[];
    const match = locality
      ? rows.find((r) => str((r.metadata as Record<string, unknown> | null)?.locality) === locality) ?? null
      : rows[0] ?? null;
    if (!match) return null;
    const md = (match.metadata as Record<string, unknown> | null) ?? {};
    const status = str(match.status) ?? "unknown";
    const startedAt = str(match.started_at);
    const isStale = status === "running" && !!startedAt && Date.now() - new Date(startedAt).getTime() > STALE_MS;
    return {
      id: str(match.id) ?? "",
      locality: str(md.locality),
      status,
      providerStatus: str(md.provider_status),
      startedAt,
      finishedAt: str(match.finished_at),
      durationMs: match.duration_ms == null ? null : n(match.duration_ms),
      officesDiscovered: n(md.offices_discovered),
      agentsDiscovered: n(md.agents_discovered),
      relationshipsDiscovered: n(md.relationships_discovered),
      agentsWithoutOffice: n(md.agents_without_office),
      error: str(match.error),
      isStale,
    };
  } catch { return null; }
}
