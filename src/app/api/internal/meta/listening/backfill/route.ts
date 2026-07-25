// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL listening backfill. Phase 5.
// POST { orgId, sourceId } → enqueue a bounded, resumable backfill job. Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runListeningBackfill } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; }

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.orgId ?? ""); const sourceId = String(body?.sourceId ?? "");
  if (!orgId || !sourceId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try { return NextResponse.json(await runListeningBackfill(orgId, sourceId)); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "backfill_failed" }, { status: 500 }); }
}
