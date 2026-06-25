import { NextResponse, type NextRequest } from "next/server";
import { runHourlyPropertyRadarJob } from "@/lib/property-radar/scheduler/jobs";

/**
 * Hourly Property Radar™ orchestrator — secured by CRON_SECRET. Disabled unless
 * CRON_SECRET is configured. Runs nothing unless PROPERTY_RADAR_PROVIDER is set
 * (no real provider is ever called implicitly). Returns a non-sensitive summary.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const s = await runHourlyPropertyRadarJob();
    return NextResponse.json({
      ok: true,
      provider: s.provider,
      orgsConsidered: s.orgsConsidered,
      areasConsidered: s.areasConsidered,
      areasDue: s.areasDue,
      areasRun: s.areasRun,
      areasSkipped: s.areasSkipped,
      newListings: s.newListings,
      creditsUsed: s.creditsUsed,
      skippedReason: s.skippedReason,
      errorCount: s.errors.length,
    });
  } catch (e) {
    console.error("[property-radar-sync] cron failed", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cron failed" },
      { status: 500 },
    );
  }
}
