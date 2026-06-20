import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithCoverage, refreshRecentTransactionsForOrganization } from "@/lib/transactions/service";

/**
 * Manual/cron transaction refresh — secured by CRON_SECRET. Disabled by default
 * unless CRON_SECRET is configured. Pulls only recent (12m) transactions per
 * org coverage target to bound cost. Never runs without a configured Apify token
 * (the service isolates and skips when unavailable).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const orgs = await organizationsWithCoverage();
    const results = [];
    for (const orgId of orgs) {
      try {
        results.push(await refreshRecentTransactionsForOrganization(orgId));
      } catch (e) {
        results.push({ organizationId: orgId, error: e instanceof Error ? e.message : "refresh failed" });
      }
    }
    return NextResponse.json({ ok: true, organizations: orgs.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
