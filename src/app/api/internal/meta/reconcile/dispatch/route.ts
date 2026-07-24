// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTERNAL reconcile dispatch+work. Phase 3C.
// POST → one bounded tick: atomically claim due verification jobs (SKIP LOCKED)
// and drive each through the sealed READ-ONLY inspection gateway. PROTECTED:
// Bearer CRON_SECRET only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runReconcileDispatchTick } from "@/lib/meta/reconcile/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runReconcileDispatchTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 }); }
}
