// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL inbox sync recovery. Phase 3.
// POST → requeue abandoned inbox sync jobs whose lease went stale. Inbox sync is a
// read-only local projection (no provider side effect), so an abandoned job is
// safely re-runnable. PROTECTED: Bearer CRON_SECRET only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runInboxRecoveryTick } from "@/lib/meta/inbox/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runInboxRecoveryTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
