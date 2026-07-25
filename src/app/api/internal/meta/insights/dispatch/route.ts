// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL insight dispatch. Phase 2.
// POST → one bounded tick: atomically claim due insight refresh jobs (SKIP LOCKED)
// and drive each through the sealed READ-ONLY insights gateway. PROTECTED: Bearer
// CRON_SECRET only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runInsightDispatchTick } from "@/lib/meta/insights/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runInsightDispatchTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 }); }
}
