// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL comment recovery. Phase 1.
// POST → reap stale comment-job leases. Ingestion/confirm reads safely requeue; an
// abandoned mid-execution moderation WRITE is ambiguous → the action goes to
// manual review, never a blind re-send. PROTECTED: Bearer CRON_SECRET only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runCommentRecoveryTick } from "@/lib/meta/engagement/service";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runCommentRecoveryTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
