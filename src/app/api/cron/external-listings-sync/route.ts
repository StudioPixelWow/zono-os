import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities, syncExternalListingsForOrganization, type SyncMode, type SyncSummary } from "@/lib/external-listings/service";
import { orgBudgetDecision } from "@/lib/external-listings/budget";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Hard time budget (never rely on the 300s SIGKILL as normal operation) ─────
const HARD_LIMIT_MS = 300_000;                         // Vercel serverless kill
const SAFETY_MARGIN_MS = 60_000;                       // finalize + response headroom
const APPLICATION_DEADLINE_MS = HARD_LIMIT_MS - SAFETY_MARGIN_MS; // 240s: intentional stop
const MIN_ORG_BUDGET_MS = 45_000;                      // never START an org with less left
const DEFAULT_ORG_MS = 120_000;                        // estimate when an org has no history
const ORG_SAFETY = 1.25;                               // pad the historical estimate
const NIGHTLY_HOUR_UTC = 2;
const STALE_MS = 15 * 60 * 1000;
const WATCH_SOURCE = "hourly-market-watch";

type DB = ReturnType<typeof createServiceRoleClient>;

/** Order orgs stalest-first by their most recent import job (bounded fairness:
 *  a deferred org writes no import_job, so it stays stalest → first next run). */
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

/** Per-org duration estimate from the org's last terminal watch run. */
async function orgDurationEstimates(db: DB): Promise<Map<string, number>> {
  const est = new Map<string, number>();
  try {
    const { data } = await db.from("zono_orchestrator_runs")
      .select("organization_id,duration_ms,status,started_at")
      .eq("source", WATCH_SOURCE).in("status", ["success", "partial"])
      .order("started_at", { ascending: false }).limit(500);
    for (const r of (data ?? []) as { organization_id: string; duration_ms: number | null }[]) {
      if (r.organization_id && r.duration_ms && !est.has(r.organization_id)) est.set(r.organization_id, r.duration_ms);
    }
  } catch { /* estimate is best-effort */ }
  return est;
}

/** Stale-run recovery — DEFENSE-IN-DEPTH ONLY. With the deadline fix, a normal
 *  run should never leave a stale `running` row; if this recovers anything it is
 *  an operational incident (surfaced in the response). */
async function closeStuckWatchRuns(db: DB): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const { data } = await db.from("zono_orchestrator_runs")
      .update({ status: "timed_out", finished_at: new Date().toISOString(), error: "stale hourly-market-watch run auto-recovered (defense-in-depth)" })
      .eq("source", WATCH_SOURCE).eq("status", "running").lt("started_at", cutoff).select("id");
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

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

/** Finalize a watch run to a terminal state. `deferred` is a distinct outcome
 *  from success/partial/failed — the org's remaining work rolls to next cycle. */
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
        deferred: s?.deferred ?? false,
        enrichment_deferred: s?.enrichmentDeferred ?? false,
        cities_remaining: s?.citiesRemaining ?? [],
      },
    }).eq("id", id);
  } catch { /* best-effort observability */ }
}

/** Record an org that was NOT started because insufficient budget remained —
 *  a terminal `deferred` row (never a zombie), high-priority next run. */
async function writeDeferredRun(db: DB, orgId: string, mode: SyncMode, window: string, remainingMs: number): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    await db.from("zono_orchestrator_runs").insert({
      organization_id: orgId, trigger: "scheduled_cron", source: WATCH_SOURCE,
      status: "deferred", started_at: nowIso, finished_at: nowIso, duration_ms: 0,
      steps: [], metadata: { job_type: WATCH_SOURCE, mode, window, deferred: true, reason: "insufficient_budget", remaining_budget_ms: Math.max(0, Math.round(remainingMs)) },
    });
  } catch { /* best-effort */ }
}

/**
 * HOURLY MARKET WATCH (Vercel Cron `0 * * * *`). Quick/incremental hourly, deep
 * `standard` at 02:00 UTC. No login/dashboard dependency.
 *
 * HARD-BUDGET CLOSURE (P9.4): the invocation stops itself BEFORE the 300s kill.
 * An APPLICATION_DEADLINE (240s) is passed into each org sync so a single large
 * org is interruptible (it defers heavy enrichment / remaining cities instead of
 * overrunning). An org is only STARTED when enough budget remains to finish it;
 * otherwise it is recorded `deferred` (terminal, high-priority next run) — never
 * a zombie. Stale recovery remains as pure defense-in-depth. CRON_SECRET.
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
  const deadline = startedAt + APPLICATION_DEADLINE_MS;
  const db = createServiceRoleClient();

  try {
    const recovered = await closeStuckWatchRuns(db);
    const orgs = await orderByStalestScan(db, await organizationsWithActiveLocalities());
    const estimates = await orgDurationEstimates(db);
    const results: unknown[] = [];
    let processed = 0, failed = 0, deferred = 0;

    for (const orgId of orgs) {
      const remaining = deadline - Date.now();
      const decision = orgBudgetDecision({
        remainingMs: remaining, estMs: estimates.get(orgId) ?? DEFAULT_ORG_MS,
        minStartMs: MIN_ORG_BUDGET_MS, safety: ORG_SAFETY, deadlineMs: APPLICATION_DEADLINE_MS,
      });
      if (decision === "stop") {                    // truly out of budget — defer the rest
        for (const rest of orgs.slice(orgs.indexOf(orgId))) { await writeDeferredRun(db, rest, mode, window, remaining); deferred++; }
        break;
      }
      if (decision === "defer") {                   // not enough to finish THIS org — try smaller ones behind it
        await writeDeferredRun(db, orgId, mode, window, remaining); deferred++;
        continue;
      }

      const runStart = Date.now();
      const runId = await openRun(db, orgId, mode, window);
      try {
        const summary = await syncExternalListingsForOrganization(orgId, { mode, deadline });
        const status = summary.deferred ? "partial" : summary.success ? "success" : "partial";
        await finishRun(db, runId, runStart, status, summary, summary.errors[0] ?? null);
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
      ok: true, window, mode,
      staleRecovered: recovered,                    // should be 0 in normal operation
      orgsTotal: orgs.length, processed, deferred, failed,
      durationMs: Date.now() - startedAt, remainingBudgetMs: Math.max(0, deadline - Date.now()), results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
