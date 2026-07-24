// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTERNAL reconcile recovery. Phase 3C.
// POST → reap stale reconciliation leases. Inspection is READ-ONLY, so an
// abandoned job is safely requeued (no provider write to fear). PROTECTED:
// Bearer CRON_SECRET only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runReconcileRecoveryTick } from "@/lib/meta/reconcile/service";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runReconcileRecoveryTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
