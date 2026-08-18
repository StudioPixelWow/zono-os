// ============================================================================
// 🔔 ZONO — FOLLOW-UP RECONCILE cron (GET). The safety net that guarantees no
// active lead is left without a next action: it re-derives each org's follow-up
// state and, for deterministic situations, ensures the missing safe follow-up
// task exists (idempotent via tasks.intelligence_source) and emits the canonical
// follow-up events (deduped once/day). Event-driven creation handles the instant
// path; this backstops it. Bounded, org-safe, retry-safe. GET + Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { reconcileAllOrgs } from "@/lib/follow-up/automation";
import { reconcileAllOrgsDeals } from "@/lib/follow-up/deal-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const r = await reconcileAllOrgs({ orgLimit: 100, perOrgLimit: 300 });
    // Same safety net, extended to ACTIVE DEALS: guarantee a next action on each
    // and surface stale deals (reuses tasks + idempotency; never closes a deal).
    const d = await reconcileAllOrgsDeals({ orgLimit: 100, perOrgLimit: 300 });
    return NextResponse.json({
      ok: true,
      leads: { orgs: r.orgs, tasksCreated: r.tasksCreated, events: r.events },
      deals: { orgs: d.orgs, tasksCreated: d.tasksCreated, stale: d.stale },
      durationMs: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "followup_reconcile_failed" }, { status: 500 });
  }
}
