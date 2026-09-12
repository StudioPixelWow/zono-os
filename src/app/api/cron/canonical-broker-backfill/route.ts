import { NextResponse, type NextRequest } from "next/server";
import { backfillCanonicalBrokers } from "@/lib/broker/canonical-broker-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Canonical broker backfill (Vercel Cron). Converges broker_profiles + brokerage_agents
 * into canonical_brokers (phone/email merge; name-only standalone) + broker_identity_links
 * + broker_office_memberships. Idempotent, non-destructive. Secured by CRON_SECRET.
 * ?dryRun=1 reports the plan without writing (run this first).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const report = await backfillCanonicalBrokers({ dryRun });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "canonical broker backfill failed" }, { status: 500 });
  }
}
