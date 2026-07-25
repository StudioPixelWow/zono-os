// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTERNAL intelligence queue health. Phase 4.
// GET → secret-free, low-cardinality queue-health snapshot (status buckets, dead-
// letter count, oldest-due age). No identifiers. PROTECTED: Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getIntelligenceQueueHealth } from "@/lib/meta/intelligence/service";
import { evaluateQueueHealth } from "@/lib/meta/intelligence/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const health = await getIntelligenceQueueHealth(null);
    return NextResponse.json({ ok: true, ...health, evaluation: evaluateQueueHealth(health) });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "health_failed" }, { status: 500 }); }
}
