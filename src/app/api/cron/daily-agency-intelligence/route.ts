import { NextResponse, type NextRequest } from "next/server";

/**
 * ZONO — PHASE 26.11: Daily Agency Intelligence™ cron endpoint (PREPARED, NOT
 * force-enabled). Secured by the existing CRON_SECRET Bearer pattern. The daily
 * pipeline (resolveAgentAgenciesJob → … → buildRainGraphJob) runs PER ORGANIZATION
 * via runDailyAgencyIntelligenceJob(orgId), which relies on the org session
 * context. Org-fan-out under a service-role identity is intentionally NOT enabled
 * in this phase, so this endpoint authenticates and reports readiness without
 * mutating data. The job itself is exported and is triggered today by the
 * Competition Radar refresh action. No external scraping.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    enabled: false,
    job: "daily_agency_intelligence",
    note:
      "Prepared. Per-org scheduled execution is not enabled in this phase. " +
      "Run runDailyAgencyIntelligenceJob(organizationId) in an org context (e.g. the Competition Radar refresh).",
  });
}
