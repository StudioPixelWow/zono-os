// ============================================================================
// 🏠 ZONO — BUYER MATCH BUNDLES cron (GET). Sends each eligible, opted-in buyer
// ONE bundle of their top net-new high-confidence matches (never one msg/property,
// never a property twice, max 1 bundle/buyer/day). Consent-gated marketing; email
// today, WhatsApp when an approved template exists. Bounded, org-safe, idempotent.
// GET + Bearer CRON_SECRET. Scheduled daily on workdays in vercel.json.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runAllOrgsBuyerMatchBundles } from "@/lib/customer-comm/match-bundle";

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
    const r = await runAllOrgsBuyerMatchBundles({ orgLimit: 100, perOrgLimit: 200 });
    return NextResponse.json({ ok: true, orgs: r.orgs, bundlesSent: r.bundlesSent, skipped: r.skipped, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "buyer_match_bundles_failed" }, { status: 500 });
  }
}
