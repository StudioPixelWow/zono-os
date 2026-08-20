/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// 📣 ZONO — COMMUNICATION DISPATCH cron (GET). The single consumer of the
// domain_events outbox for communication: it re-evaluates recent events through
// the orchestrator (idempotent — re-runs never double-send) and flushes the
// deferred/retry delivery queue. Business writes never call the orchestrator
// synchronously, so a slow provider can never break a core transaction.
// Bounded, org-safe. GET + Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { COMM_EVENT_MATRIX } from "@/lib/communication/policy";
import { processCommunicationEvent } from "@/lib/communication/orchestrator";
import { processDueQueue, reapOrphanDeliveries } from "@/lib/communication/dispatch";
import { scanMeetingReminders } from "@/lib/communication/meeting-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get("authorization") === `Bearer ${s}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const db: any = createServiceRoleClient();
    // Schedule meeting reminders first, so their just-emitted events fall inside
    // the consumption window below and route through the same orchestrator path.
    const mr = await scanMeetingReminders();
    // Overlapping window (cron every 5 min) — dedup makes the overlap a no-op.
    const sinceIso = new Date(Date.now() - 12 * 60_000).toISOString();
    const types = Object.keys(COMM_EVENT_MATRIX);
    const { data } = await db.from("domain_events")
      .select("event_type,organization_id,actor_user_id,entity_type,entity_id,payload,occurred_at")
      .gte("occurred_at", sinceIso).in("event_type", types)
      .order("occurred_at", { ascending: true }).limit(500);
    const rows = (data ?? []) as any[];
    let processed = 0;
    for (const e of rows) {
      await processCommunicationEvent({
        eventType: e.event_type, orgId: e.organization_id, entityId: e.entity_id,
        entityType: e.entity_type, actorUserId: e.actor_user_id, payload: e.payload, occurredAt: e.occurred_at,
      });
      processed++;
    }
    // Reap orphaned queued rows (crashed immediate sends) so the dispatcher below
    // finishes them, and surface the terminal dead-letter count for operators.
    const reap = await reapOrphanDeliveries(200, 15);
    const q = await processDueQueue(200);
    return NextResponse.json({ ok: true, meetingReminders: mr.emitted, processed, ...q, reaped: reap.reaped, deadLetter: reap.failedCount, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "comm_dispatch_failed" }, { status: 500 });
  }
}
