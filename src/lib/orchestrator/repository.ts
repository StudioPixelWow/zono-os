// ============================================================================
// ZONO Orchestrator — run ledger persistence + staleness reads.
// Service-role client so it works in cron + session contexts.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { OrchestratorRunStatus, OrchestratorStepResult, ZonoOrchestratorTrigger } from "./types";

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
