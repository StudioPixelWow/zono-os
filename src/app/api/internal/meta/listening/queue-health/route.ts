// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL listening queue health. Phase 5.
// GET → secret-free, low-cardinality queue-health snapshot + evaluation. Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getListeningQueueHealth } from "@/lib/meta/listening/service";
import { evaluateListeningHealth } from "@/lib/meta/listening/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; }

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const health = await getListeningQueueHealth(null);
    return NextResponse.json({ ok: true, ...health, evaluation: evaluateListeningHealth({ ...health, blockedSources: 0 }) });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "health_failed" }, { status: 500 }); }
}
