import { NextResponse, type NextRequest } from "next/server";
import { getSchedulerMode, runDailyPropertyRadarValidationJob, runMarketValidationJob } from "@/lib/property-radar/scheduler/jobs";

/**
 * Daily Property Radar™ missing/deleted validation — secured by CRON_SECRET.
 * Disabled unless CRON_SECRET is configured; no-op unless PROPERTY_RADAR_PROVIDER
 * is set. Ages stale sources missing → deleted (soft). Non-sensitive summary.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const mode = getSchedulerMode();
  try {
    if (mode === "market") {
      const s = await runMarketValidationJob();
      return NextResponse.json({
        ok: true, mode, providers: s.providers,
        areasScanned: s.areasScanned, areasSkippedFresh: s.areasSkippedFresh,
        skippedReason: s.skippedReason, errorCount: s.errors.length,
      });
    }
    const s = await runDailyPropertyRadarValidationJob();
    return NextResponse.json({
      ok: true,
      mode,
      providers: s.providers,
      orgs: s.orgs,
      totalMissing: s.totalMissing,
      totalDeleted: s.totalDeleted,
      skippedReason: s.skippedReason,
      errorCount: s.errors.length,
    });
  } catch (e) {
    console.error("[property-radar-validation] cron failed", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cron failed" },
      { status: 500 },
    );
  }
}
