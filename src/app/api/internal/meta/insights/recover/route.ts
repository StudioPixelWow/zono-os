// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL insight recovery. Phase 2.
// POST → reap stale insight-refresh leases. Insight reads are READ-ONLY, so an
// abandoned job safely requeues (no provider write). PROTECTED: Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runInsightRecoveryTick } from "@/lib/meta/insights/service";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runInsightRecoveryTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
