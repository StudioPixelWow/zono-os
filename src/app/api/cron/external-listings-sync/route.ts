import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities, syncExternalListingsForOrganization, type SyncMode } from "@/lib/external-listings/service";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Stop starting new orgs past this; leaves headroom under the 300s function limit.
const SOFT_BUDGET_MS = 250_000;
// UTC hour reserved for the deep nightly reconciliation pass.
const NIGHTLY_HOUR_UTC = 2;

/**
 * Order orgs stalest-first by their most recent import job, so that across the
 * hourly runs every active org is eventually covered even when a single run is
 * time-boxed before finishing them all. Never-synced orgs sort first.
 */
async function orderByStalestScan(orgIds: string[]): Promise<string[]> {
  if (orgIds.length <= 1) return orgIds;
  try {
    const db = createServiceRoleClient();
    const { data } = await db
      .from("import_jobs")
      .select("org_id,created_at")
      .in("org_id", orgIds)
      .order("created_at", { ascending: false });
    const lastByOrg = new Map<string, number>();
    for (const r of (data ?? []) as { org_id: string; created_at: string }[]) {
      if (!lastByOrg.has(r.org_id)) lastByOrg.set(r.org_id, new Date(r.created_at).getTime());
    }
    return [...orgIds].sort((a, b) => (lastByOrg.get(a) ?? 0) - (lastByOrg.get(b) ?? 0));
  } catch {
    return orgIds; // ordering is best-effort; correctness does not depend on it
  }
}

/**
 * HOURLY MARKET WATCH (Vercel Cron `0 * * * *`). Secured by CRON_SECRET.
 *
 * Reuses the canonical external-listings sync engine — NOT a new crawler:
 *   · every hour  → INCREMENTAL "quick" pass (recent-first, small, cost-aware)
 *   · 02:00 UTC   → DEEP "standard" reconciliation window
 *
 * No login / dashboard / after() dependency. Stalest-first org ordering,
 * time-boxed, and per-org failure isolation so one org/provider can't kill the
 * sweep. Per-org evidence is written by the engine to `import_jobs`.
 *
 * Claim-My-Listings hook (P9.2A-L): each new/changed listing produced here is
 * the input the ClaimCandidateResolver will consume. Seam is READY / NO_WRITE —
 * no claim rows are written until that migration is approved.
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

  try {
    const orgs = await orderByStalestScan(await organizationsWithActiveLocalities());
    const results: unknown[] = [];
    let processed = 0;
    let failed = 0;

    for (const orgId of orgs) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) break; // time-box; remaining orgs picked up next hour (stalest-first)
      try {
        results.push(await syncExternalListingsForOrganization(orgId, { mode }));
      } catch (e) {
        failed++;
        results.push({ success: false, organizationId: orgId, error: e instanceof Error ? e.message : "sync failed" });
      }
      processed++;
    }

    return NextResponse.json({
      ok: true,
      window: isNightly ? "nightly-deep" : "hourly-incremental",
      mode,
      orgsTotal: orgs.length,
      processed,
      skipped: orgs.length - processed,
      failed,
      durationMs: Date.now() - startedAt,
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
