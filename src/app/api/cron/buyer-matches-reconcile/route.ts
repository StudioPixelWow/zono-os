// ============================================================================
// ZONO — BUYER MATCHES RECONCILE cron (GET). Safety reconciliation so a buyer's
// matched-property set never goes stale between page opens: recomputes each org's
// matches through the canonical service-role engine (generateMatchesForOrgId).
// Bounded, org-isolated, idempotent (upsert). No full scan per page load.
// GET + Bearer CRON_SECRET. Scheduled in vercel.json.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { reconcileAllOrgMatches } from "@/lib/matching-intelligence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const r = await reconcileAllOrgMatches({ orgLimit: 100 });
    return NextResponse.json({ ok: true, ...r, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "reconcile_failed" }, { status: 500 });
  }
}
