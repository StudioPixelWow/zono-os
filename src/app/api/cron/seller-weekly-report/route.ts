// ============================================================================
// 📬 ZONO — SELLER WEEKLY REPORT cron (GET). Sends the branded "השבוע בנכס שלך"
// email to each actively-listed property's report-subscribed primary seller,
// consent-gated and idempotent (once per property/seller/week). Bounded, org-safe.
// GET + Bearer CRON_SECRET. Schedule weekly (e.g. Sunday morning) in vercel.json.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runAllOrgsSellerWeeklyReports } from "@/lib/customer-comm/seller-report";

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
    const r = await runAllOrgsSellerWeeklyReports({ orgLimit: 100, perOrgLimit: 200 });
    return NextResponse.json({ ok: true, orgs: r.orgs, sent: r.sent, skipped: r.skipped, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "seller_weekly_report_failed" }, { status: 500 });
  }
}
