// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · CRON entrypoint (GET).
// Drains the STANDARD group (engagement, intelligence, reconcile) by fanning
// out to the EXISTING per-subsystem dispatch tick services via the orchestrator.
// GET + Bearer CRON_SECRET (identical to kernel-drain). Orchestration only — no
// queue logic, no provider logic.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runDispatchGroup } from "@/lib/meta/ops/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runDispatchGroup("standard")) });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 }); }
}
