import { NextResponse, type NextRequest } from "next/server";
import { geocodeGeoBacklogForAllOrganizations } from "@/lib/geo/geo-enrichment";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * AVM 3.2 §17 — nightly geo backlog for SUBJECT properties + SOLD transactions.
 * The valuation AVM compares a property to nearby real evidence, which needs
 * coordinates; this drains the un-geocoded backlog in bounded, org-scoped batches
 * using the ONE canonical geocoder (Google→OSM). Real coordinates only — failures
 * are marked, never invented. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const results = await geocodeGeoBacklogForAllOrganizations();
    const totals = results.reduce(
      (a, r) => ({
        properties: a.properties + r.properties.resolved,
        transactions: a.transactions + r.transactions.resolved,
        failed: a.failed + r.properties.failed + r.transactions.failed,
      }),
      { properties: 0, transactions: 0, failed: 0 },
    );
    return NextResponse.json({ ok: true, organizations: results.length, totals });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
