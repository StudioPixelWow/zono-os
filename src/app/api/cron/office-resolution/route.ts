import { NextResponse, type NextRequest } from "next/server";
import { backfillOfficesFromAgencyNames } from "@/lib/office-intel/office-resolution-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Office resolution / backfill (Vercel Cron). Turns the yad2 `agencyName` evidence
 * (previously discarded) into real offices + office↔listing links + agent→office
 * membership. Idempotent + non-destructive. Secured by CRON_SECRET.
 * Pass ?dryRun=1 to compute + report the plan WITHOUT writing (run this first).
 * Pass ?org=<id> to scope to one org.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const orgId = req.nextUrl.searchParams.get("org") ?? undefined;
  try {
    const report = await backfillOfficesFromAgencyNames({ dryRun, orgId });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "office resolution failed" }, { status: 500 });
  }
}
