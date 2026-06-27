// ============================================================================
// ZONO Orchestrator — run ledger persistence + staleness reads.
// Service-role client so it works in cron + session contexts.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { OrchestratorRunStatus, OrchestratorStepResult, ZonoOrchestratorTrigger } from "./types";
import type { SystemRefreshStatusRaw } from "./status";

type Db = ReturnType<typeof createServiceRoleClient>;

export async function createRunRow(input: {
  organizationId: string; userId: string | null; trigger: ZonoOrchestratorTrigger; source: string | null;
}): Promise<string | null> {
  const db = createServiceRoleClient() as Db;
  const { data } = await db
    .from("zono_orchestrator_runs")
    .insert({
      organization_id: input.organizationId, user_id: input.userId, trigger: input.trigger,
      source: input.source, status: "running", started_at: new Date().toISOString(),
    } as never)
    .select("id").single();
  return (data?.id as string) ?? null;
}

export async function finalizeRunRow(runId: string, input: {
  status: OrchestratorRunStatus; durationMs: number; steps: OrchestratorStepResult[]; error: string | null;
}): Promise<void> {
  const db = createServiceRoleClient() as Db;
  try {
    await db.from("zono_orchestrator_runs").update({
      status: input.status, finished_at: new Date().toISOString(), duration_ms: input.durationMs,
      steps: input.steps as never, error: input.error,
    } as never).eq("id", runId);
  } catch { /* best-effort */ }
}

/**
 * Read the raw system-refresh status for ONE organization (never cross-org):
 *  • latest run of any status (started_at + status + isRunning)
 *  • latest SUCCESS/PARTIAL finished_at (for the freshness ladder)
 *  • count of unread alerts
 * Returns a safe zero-state on any error (caller logs).
 */
export async function getSystemRefreshStatusRaw(organizationId: string): Promise<SystemRefreshStatusRaw> {
  const db = createServiceRoleClient() as Db;
  const empty: SystemRefreshStatusRaw = {
    lastRunAt: null, lastStatus: null, lastSuccessAt: null, isRunning: false, unreadAlertsCount: 0,
  };

  // 1) Latest run of any status for this org.
  const { data: latest } = await db
    .from("zono_orchestrator_runs")
    .select("status,started_at")
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .limit(1);
  const latestRow = latest?.[0] as { status?: string; started_at?: string } | undefined;
  const lastStatus = (latestRow?.status as SystemRefreshStatusRaw["lastStatus"]) ?? null;
  const lastRunAt = latestRow?.started_at ?? null;
  const isRunning = lastStatus === "running";

  // 2) Latest SUCCESS/PARTIAL finished_at.
  const { data: success } = await db
    .from("zono_orchestrator_runs")
    .select("finished_at")
    .eq("organization_id", organizationId)
    .in("status", ["success", "partial"])
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1);
  const lastSuccessAt = (success?.[0]?.finished_at as string | undefined) ?? null;

  // 3) Unread alerts for this org (head:true → count only, no rows).
  const { count } = await db
    .from("property_alerts" as never)
    .select("id", { count: "exact", head: true })
    .eq("org_id", organizationId)
    .eq("status", "unread");

  return {
    ...empty,
    lastRunAt, lastStatus, lastSuccessAt, isRunning,
    unreadAlertsCount: count ?? 0,
  };
}

/** ms since the last SUCCESS/PARTIAL run finished, or null if none. */
export async function msSinceLastSuccessfulRun(organizationId: string): Promise<number | null> {
  const db = createServiceRoleClient() as Db;
  const { data } = await db
    .from("zono_orchestrator_runs")
    .select("finished_at,status")
    .eq("organization_id", organizationId)
    .in("status", ["success", "partial"])
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1);
  const last = data?.[0]?.finished_at;
  if (!last) return null;
  return Date.now() - new Date(last).getTime();
}
