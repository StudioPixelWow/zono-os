// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTERNAL dispatch+work. Phase 3B.
// POST /api/internal/meta/publish/dispatch → one bounded dispatch tick: atomically
//   claim a fair batch of due jobs (FOR UPDATE SKIP LOCKED) and drive each through
//   the sealed Phase-3A executor. PROTECTED: Bearer CRON_SECRET only — never a
//   public, unauthenticated worker endpoint. Bounded by concurrency + rate budget.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runDispatchTick } from "@/lib/meta/schedule/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runDispatchTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 });
  }
}
