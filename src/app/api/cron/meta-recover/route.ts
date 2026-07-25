// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · CRON entrypoint (GET).
// Runs RECOVERY across all eight durable Meta queues by fanning out to the
// EXISTING per-subsystem recovery tick services via the orchestrator (requeues
// stale-leased jobs; dead-letters the exhausted per each subsystem's own rules).
// GET + Bearer CRON_SECRET (identical to kernel-drain). Orchestration only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runRecoverAll } from "@/lib/meta/ops/orchestrator";

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
    return NextResponse.json({ ok: true, ...(await runRecoverAll()) });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
