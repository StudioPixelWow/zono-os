import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities, syncExternalListingsForOrganization, type SyncMode, type SyncSummary } from "@/lib/external-listings/service";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SOFT_BUDGET_MS = 250_000;
const NIGHTLY_HOUR_UTC = 2;
const STALE_MS = 15 * 60 * 1000;
const WATCH_SOURCE = "hourly-market-watch";

type DB = ReturnType<typeof createServiceRoleClient>;

/** Order orgs stalest-first by their most recent import job so that across the
 *  hourly runs every active org is eventually covered under the time-box. */
async function orderByStalestScan(db: DB, orgIds: string[]): Promise<string[]> {
  if (orgIds.length <= 1) return orgIds;
  try {
    const { data } = await db.from("import_jobs").select("org_id,created_at").in("org_id", orgIds).order("created_at", { ascending: false });
    const lastByOrg = new Map<string, number>();
    for (const r of (data ?? []) as { org_id: string; created_at: string }[]) {
      if (!lastByOrg.has(r.org_id)) lastByOrg.set(r.org_id, new Date(r.created_at).getTime());
    }
    return [...orgIds].sort((a, b) => (lastByOrg.get(a) ?? 0) - (lastByOrg.get(b) ?? 0));
  } catch {
    return orgIds;
  }
}

/** Stale-run recovery: a serverless SIGKILL skips the finalizer below, leaving a
 *  `running` watch row forever. Reconcile any watch run older than the window. */
async function closeStuckWatchRuns(db: DB): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const { data } = await db.from("zono_orchestrator_runs")
      .update({ status: "timed_out", finished_at: new Date().toISOString(), error: "stale hourly-market-watch run auto-recovered" })
      .eq("source", WATCH_SOURCE).eq("status", "running").lt("started_at", cutoff).select("id");
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

/** Open a per-org watch run row (running) in the canonical orchestrator ledger. */
async function openRun(db: DB, orgId: string, mode: SyncMode, window: string): Promise<string | null> {
  try {
    const { data } = await db.from("zono_orchestrator_runs").insert({
      organization_id: orgId, trigger: "scheduled_cron", source: WATCH_SOURCE,
      status: "running", started_at: new Date().toISOString(),
      steps: [], metadata: { job_type: WATCH_SOURCE, mode, window },
    }).select("id").single();
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/** Finalize a watch run row to a terminal state with safe metrics. */
async function finishRun(db: DB, id: string | null, startedAt: number, status: string, s: SyncSummary | null, err: string | null): Promise<void> {
  if (!id) return;
  try {
    await db.from("zono_orchestrator_runs").update({
      status, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt,
      error: err,
      metadata: {
        job_type: WATCH_SOURCE,
        cities_processed: s?.cities.length ?? 0,
        sources: s?.sources ?? [],
        new_listings: s?.inserted ?? 0,
        changed_listings: s?.updated ?? 0,
        error_count: s?.errors.length ?? 0,
      },
    }).eq("id", id);
  } catch { /* best-effort observability */ }
}

/**
 * HOURLY MARKET WATCH (Vercel Cron `0 * * * *`). Reuses the canonical sync engine.
 *   · hourly → INCREMENTAL `quick` (recent-first)   · 02:00 UTC → DEEP `standard`
 * No login/dashboard dependency. Stalest-first, time-boxed, per-org isolation.
 * Persists a per-org run row to `zono_orchestrator_runs` (source=hourly-market-watch)
 * with a running→terminal lifecycle + stale-run recovery, so health is never a
 * permanent "running". Secured by CRON_SECRET.
 *
 * Claim-My-Listings hook (P9.2A-L): each new/changed listing here is the input the
 * ClaimCandidateResolver will consume — seam READY / NO_WRITE (no claim rows).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const isNightly = new Date().getUTCHours() === NIGHTLY_HOUR_UTC;
  const mode: SyncMode = isNightly ? "standard" : "quick";
  const window = isNightly ? "nightly-deep" : "hourly-incremental";
  const db = createServiceRoleClient();

  try {
    const recovered = await closeStuckWatchRuns(db);
    const orgs = await orderByStalestScan(db, await organizationsWithActiveLocalities());
    const results: unknown[] = [];
    let processed = 0, failed = 0;

    for (const orgId of orgs) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) break; // time-box; rest next hour (stalest-first)
      const runStart = Date.now();
      const runId = await openRun(db, orgId, mode, window);
      try {
        const summary = await syncExternalListingsForOrganization(orgId, { mode });
        await finishRun(db, runId, runStart, summary.success ? "success" : "partial", summary, summary.errors[0] ?? null);
        results.push(summary);
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : "sync failed";
        await finishRun(db, runId, runStart, "failed", null, msg);
        results.push({ success: false, organizationId: orgId, error: msg });
      }
      processed++;
    }

    return NextResponse.json({
      ok: true, window, mode, recovered,
      orgsTotal: orgs.length, processed, skipped: orgs.length - processed, failed,
      durationMs: Date.now() - startedAt, results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
