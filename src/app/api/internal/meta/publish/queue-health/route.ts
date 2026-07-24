// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTERNAL queue health. Phase 3B.
// GET /api/internal/meta/publish/queue-health → global, secret-free queue-health
//   snapshot + grade (backlog, in-flight, retry-wait, dead-letter, oldest-due).
//   PROTECTED: Bearer CRON_SECRET only. No identifiers, tokens, or payloads.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getQueueHealth } from "@/lib/meta/schedule/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, health: await getQueueHealth(null) });
}
