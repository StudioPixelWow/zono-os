import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities } from "@/lib/external-listings/service";
import { runZonoOrchestrator } from "@/lib/orchestrator";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Stop starting new orgs before Vercel's maxDuration=300 kills us mid-org.
const SOFT_BUDGET_MS = 240_000;

/**
 * Order orgs LEAST-RECENTLY-RUN first so a never-run org (a freshly onboarded
 * office) is always processed before heavy incumbents. Previously the sequential
 * loop ran orgs in an arbitrary order and timed out on the first big org, so new
 * offices (e.g. Landsman Rehovot) were never reached and their office/broker
 * intelligence never populated. Orgs with no prior cron run sort first.
 */
async function orderByStalestCron(orgIds: string[]): Promise<string[]> {
  try {
    const db = createServiceRoleClient();
    const { data } = await db
      .from("zono_orchestrator_runs" as never)
      .select("organization_id,started_at")
      .in("organization_id", orgIds as never)
      .eq("trigger", "scheduled_cron")
      .order("started_at", { ascending: false })
      .limit(5000);
    const last = new Map<string, string>();
    for (const r of ((data ?? []) as { organization_id: string; started_at: string }[])) {
      if (!last.has(r.organization_id)) last.set(r.organization_id, r.started_at);
    }
    return [...orgIds].sort((a, b) => (last.get(a) ?? "").localeCompare(last.get(b) ?? ""));
  } catch {
    return orgIds;
  }
}

/**
 * Best-effort: close orchestrator runs stuck in "running" past the lock lifetime,
 * so a killed invocation never leaves a run reading as active (and never blocks
 * the freshness/status UI).
 */
async function closeStuckRuns(): Promise<void> {
  try {
    const db = createServiceRoleClient();
    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    await db
      .from("zono_orchestrator_runs" as never)
      .update({ status: "failed", error: "פג זמן הריצה (נסגר אוטומטית)", finished_at: new Date().toISOString() } as never)
      .eq("status", "running")
      .lt("started_at", cutoff);
  } catch {
    /* best-effort */
  }
}

/**
 * ZONO Master Sync (Vercel Cron, 01:00). INTELLIGENCE AGGREGATION per org —
 * bridge → broker detection → area + OFFICE intelligence → market snapshots →
 * decision brain → events/alerts. Secured by CRON_SECRET. Service-role.
 *
 * The heavy Apify scrape is intentionally SKIPPED here (skipExternalSync) and runs
 * on the dedicated external-listings-sync cron, so every org here is DB-only and
 * fast — the loop reliably covers ALL orgs within one invocation instead of timing
 * out on the first heavy org. Combined with least-recently-run ordering + a soft
 * time budget, a new office is guaranteed to be processed.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await closeStuckRuns();
    const orgs = await orderByStalestCron(await organizationsWithActiveLocalities());
    const results: unknown[] = [];
    const startedAt = Date.now();
    for (const orgId of orgs) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) {
        results.push({ organizationId: orgId, status: "deferred", reason: "soft time budget — next cron continues" });
        continue;
      }
      const r = await runZonoOrchestrator({
        organizationId: orgId,
        trigger: "scheduled_cron",
        force: true,
        skipExternalSync: true,
        source: "zono-master-sync",
      });
      results.push({ organizationId: orgId, status: r.status, durationMs: r.durationMs, steps: r.steps.map((s) => ({ name: s.name, status: s.status, summary: s.summary })) });
    }
    return NextResponse.json({ ok: true, organizations: orgs.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
