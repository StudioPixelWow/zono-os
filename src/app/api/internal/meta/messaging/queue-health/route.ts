// INTERNAL messaging queue health: secret-free low-cardinality snapshot. Bearer CRON_SECRET.
import { NextResponse, type NextRequest } from "next/server";
import { getMessagingQueueHealth } from "@/lib/meta/messaging/service";
import { evaluateMessagingHealth } from "@/lib/meta/messaging/observability";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
function authorized(req: NextRequest): boolean { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; }
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { const h = await getMessagingQueueHealth(null); return NextResponse.json({ ok: true, ...h, evaluation: evaluateMessagingHealth({ ...h, manualReview: 0 }) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "health_failed" }, { status: 500 }); }
}
