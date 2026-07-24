// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTERNAL recovery sweep. Phase 3B.
// POST /api/internal/meta/publish/recover → reap stale leases + reclassify
//   abandoned jobs: pre-execution → safe requeue; mid-execution → ambiguous →
//   dead-letter + manual review (NEVER a blind re-run). PROTECTED: Bearer
//   CRON_SECRET only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runRecoveryTick } from "@/lib/meta/schedule/service";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runRecoveryTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 });
  }
}
