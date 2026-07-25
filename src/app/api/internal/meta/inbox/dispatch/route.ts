// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL inbox sync dispatch+work. Phase 3.
// POST → one bounded tick: atomically claim due inbox sync jobs (SKIP LOCKED) and
// fold each org+platform's newly-updated comment threads into unified conversations
// (LOCAL projection; NO Graph call). PROTECTED: Bearer CRON_SECRET only.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runInboxDispatchTick } from "@/lib/meta/inbox/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runInboxDispatchTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 }); }
}
