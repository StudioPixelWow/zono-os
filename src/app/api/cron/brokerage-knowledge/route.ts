import { NextResponse, type NextRequest } from "next/server";
import { recomputeBrokerageKnowledge } from "@/lib/brokerage-data/knowledge/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Brokerage Knowledge Layer refresh (Vercel Cron). Recomputes the graph,
 * completeness, duplicate clusters, market share, coverage, relationship
 * discoveries and the data-health snapshot from the national brokerage data —
 * the single source of truth every AI engine reads. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await recomputeBrokerageKnowledge();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
