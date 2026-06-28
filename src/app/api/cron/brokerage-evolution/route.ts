import { NextResponse, type NextRequest } from "next/server";
import { recomputeBrokerageEvolution } from "@/lib/brokerage-data/evolution/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Brokerage EVOLUTION INTELLIGENCE™ refresh (Vercel Cron). Writes the monthly
 * entity snapshots (temporal backbone), recomputes DNA + agent career +
 * neighborhood dominance + market DNA, appends evolution events vs the previous
 * snapshot, and derives trend predictions from accumulated history. The single
 * historical source of truth every BI / AI engine reads. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await recomputeBrokerageEvolution();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
