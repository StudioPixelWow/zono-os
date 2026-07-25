// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL intelligence dispatch+work. Phase 4.
// POST → one bounded tick: enqueue scoring for materially-changed subjects, claim
// due jobs (SKIP LOCKED), and drive each through the Reasoning boundary → append-
// only signal → bounded suggestions. No provider write. PROTECTED: Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runIntelligenceDispatchTick } from "@/lib/meta/intelligence/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runIntelligenceDispatchTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 }); }
}
