// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL intelligence recovery. Phase 4.
// POST → requeue abandoned scoring jobs whose lease went stale (read/AI jobs are
// safely re-runnable; exhausted jobs dead-letter with NO automatic replay), and
// expire stale suggestions. PROTECTED: Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runIntelligenceRecoveryTick } from "@/lib/meta/intelligence/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runIntelligenceRecoveryTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
