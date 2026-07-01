import { NextResponse, type NextRequest } from "next/server";
import { runContinuousLearningSweep } from "@/lib/brokerage-data/continuous-learning";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Continuous Brokerage Intelligence™ sweep (Vercel Cron, Phase 26.4.16). Drains
 * the priority queue city-by-city — waiting candidates first, then low coverage,
 * stale evidence, unlinked listings, unmatched brokers — refreshing each city
 * differentially (no re-AI, no new searches) and evolving office confidence
 * gradually. Reuses every existing engine; changes no verification rules.
 * Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runContinuousLearningSweep(8, 240000, 18000);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
