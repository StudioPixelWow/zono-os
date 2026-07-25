// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL listening recovery. Phase 5.
// POST → requeue abandoned read jobs whose lease went stale; exhausted → dead-letter
// (no auto-replay). Read-only jobs are safely re-runnable. Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runListeningRecoveryTick } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; }

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runListeningRecoveryTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
