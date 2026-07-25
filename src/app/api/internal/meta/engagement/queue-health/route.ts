// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · INTERNAL engagement queue
// health. GET → secret-free, low-cardinality queue-health snapshot (status
// buckets, dead-letter count, oldest-due age) + coarse evaluation. No
// identifiers, tokens, or payloads. PROTECTED: Bearer CRON_SECRET only.
// Brings the comment-ingestion queue to parity with the other Meta queues.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getEngagementQueueHealth } from "@/lib/meta/engagement/service";
import { evaluateEngagementHealth } from "@/lib/meta/engagement/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const health = await getEngagementQueueHealth(null);
    return NextResponse.json({ ok: true, ...health, evaluation: evaluateEngagementHealth(health) });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "health_failed" }, { status: 500 }); }
}
