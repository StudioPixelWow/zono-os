import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities } from "@/lib/external-listings/service";
import { runZonoOrchestrator } from "@/lib/orchestrator";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SOFT_BUDGET_MS = 250_000;         // stop starting new orgs before the 300s kill
const STALE_MS = 15 * 60 * 1000;        // a run older than this with no finish is a zombie

/**
 * Stale-run recovery. A serverless timeout is a SIGKILL — the orchestrator's
 * `finally` finalizer never runs, so the row stays `status='running'` forever
 * (observed: 50 zombie rows since 2026-06-27). Mark anything still running past
 * the stale window as `timed_out` so health is never falsely "running".
 * Going-forward, the time-box + skipExternalSync below prevent new zombies.
 */
async function closeStuckRuns(): Promise<number> {
  try {
    const db = createServiceRoleClient();
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const { data } = await db
      .from("zono_orchestrator_runs")
      .update({ status: "timed_out", finished_at: new Date().toISOString(), error: "stale run auto-recovered" })
      .eq("status", "running")
      .lt("started_at", cutoff)
      .select("id");
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

/**
 * ZONO Master Sync (Vercel Cron). Intelligence AGGREGATION only — external
 * discovery is now the hourly market-watch's job (`external-listings-sync`), so
 * this runs with `skipExternalSync` and stays well under the function limit.
 * Time-boxed + per-run stale recovery so runs always reach a terminal state.
 * Secured by CRON_SECRET. Service-role.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const recovered = await closeStuckRuns();
    const orgs = await organizationsWithActiveLocalities();
    const results = [];
    let processed = 0;
    for (const orgId of orgs) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) break; // time-box; remaining orgs next run
      const r = await runZonoOrchestrator({
        organizationId: orgId,
        trigger: "scheduled_cron",
        force: true,
        source: "zono-master-sync",
        skipExternalSync: true, // external discovery handled by the hourly market watch
      });
      results.push({ organizationId: orgId, status: r.status, durationMs: r.durationMs, steps: r.steps.map((s) => ({ name: s.name, status: s.status, summary: s.summary })) });
      processed++;
    }
    return NextResponse.json({
      ok: true,
      recovered,
      organizations: orgs.length,
      processed,
      skipped: orgs.length - processed,
      durationMs: Date.now() - startedAt,
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
