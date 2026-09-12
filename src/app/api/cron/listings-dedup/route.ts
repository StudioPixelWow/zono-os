import { NextResponse, type NextRequest } from "next/server";
import { dedupeAllOrganizations } from "@/lib/external-listings/dedup-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Listing dedup backfill (Vercel Cron). Groups the same property advertised across
 * Yad2 / Madlan (and future sources) into one logical group per org — stamping
 * duplicate_group_id and recording pairs, NEVER deleting a source row. Blocking
 * keeps it near-linear. Idempotent (deterministic group ids). Secured by
 * CRON_SECRET. Pass ?dryRun=1 to compute + report counts without writing.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const results = await dedupeAllOrganizations({ dryRun });
    const totals = results.reduce(
      (a, r) => ({
        total: a.total + r.total, groups: a.groups + r.groups,
        groupedListings: a.groupedListings + r.groupedListings, highPairs: a.highPairs + r.highPairs,
        mediumPairs: a.mediumPairs + r.mediumPairs, ungrouped: a.ungrouped + r.ungrouped,
      }),
      { total: 0, groups: 0, groupedListings: 0, highPairs: 0, mediumPairs: 0, ungrouped: 0 },
    );
    return NextResponse.json({ ok: true, dryRun, organizations: results.length, totals, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dedup cron failed" }, { status: 500 });
  }
}
