// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL listening dispatch+work. Phase 5.
// POST → one bounded tick: enqueue due polls, claim due jobs (SKIP LOCKED), and pull
// via the sealed READ-ONLY gateway → normalize → dedup → match → project. Bounded
// pages/records; no synchronous provider call in a user request. Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runListeningDispatchTick } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; }

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runListeningDispatchTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 }); }
}
