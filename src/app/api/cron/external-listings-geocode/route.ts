import { NextResponse, type NextRequest } from "next/server";
import { geocodeBacklogForAllOrganizations } from "@/lib/external-listings/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Geocode-backlog drainer (Vercel Cron). The nightly sync only geocodes a capped
 * batch per run (serverless time + Nominatim's ~1 req/sec policy), so a large
 * first scrape leaves listings without coordinates — and those don't appear on
 * the live map. This drains the backlog in time-boxed batches so EVERY source
 * (Yad2, Madlan, …) gets real coordinates. Secured by CRON_SECRET. Real
 * coordinates only — failures are marked, never invented.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const results = await geocodeBacklogForAllOrganizations();
    const totals = results.reduce(
      (a, r) => ({
        attempted: a.attempted + r.stats.attempted,
        success: a.success + r.stats.success,
        failed: a.failed + r.stats.failed,
        skipped: a.skipped + r.stats.skipped,
      }),
      { attempted: 0, success: 0, failed: 0, skipped: 0 },
    );
    return NextResponse.json({ ok: true, organizations: results.length, totals, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
