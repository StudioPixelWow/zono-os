import { NextResponse, type NextRequest } from "next/server";
import { getSchedulerMode, runHourlyPropertyRadarJob, runMarketHourlyJob } from "@/lib/property-radar/scheduler/jobs";

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
  const mode = getSchedulerMode();
  try {
    if (mode === "market") {
      const s = await runMarketHourlyJob();
      return NextResponse.json({
        ok: true,
        mode,
        providers: s.providers,
        areasQueued: s.areasQueued,
        areasScanned: s.areasScanned,
        areasSkippedFresh: s.areasSkippedFresh,
        providerCallsAvoided: s.providerCallsAvoided,
        affectedOrgs: s.affectedOrgs,
        alertsCreated: s.alertsCreated,
        creditsUsed: s.creditsUsed,
        creditsSavedEstimate: s.creditsSavedEstimate,
        duplicateScansAvoided: s.duplicateScansAvoided,
        skippedReason: s.skippedReason,
        errorCount: s.errors.length,
      });
    }
    // legacy org mode
    const summaries = await runHourlyPropertyRadarJob();
    return NextResponse.json({
      ok: true,
      mode,
      providers: summaries.map((s) => ({
        provider: s.provider,
        areasRun: s.areasRun,
        newListings: s.newListings,
        creditsUsed: s.creditsUsed,
        skippedReason: s.skippedReason,
        errorCount: s.errors.length,
      })),
      totals: {
        areasRun: summaries.reduce((a, s) => a + s.areasRun, 0),
        newListings: summaries.reduce((a, s) => a + s.newListings, 0),
        creditsUsed: summaries.reduce((a, s) => a + s.creditsUsed, 0),
      },
    });
  } catch (e) {
    console.error("[property-radar-sync] cron failed", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cron failed" },
      { status: 500 },
    );
  }
}
