// ============================================================================
// ZONO — Viewing automation CRON (server-only). Sends customer confirmation
// requests for upcoming scheduled viewings and post-viewing feedback requests
// for recently completed ones. Consent-gated + idempotent (notification_deliveries).
// Bearer CRON_SECRET. Kept OUT of the booking/completion write path so a slow or
// failed provider can never break a core write.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runViewingDispatch } from "@/lib/viewings/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const r = await runViewingDispatch({ scheduledWithinDays: 14, completedWithinDays: 3, limit: 300 });
    return NextResponse.json({ ok: true, ...r, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "viewing_dispatch_failed" }, { status: 500 });
  }
}
