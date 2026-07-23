// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — Calendar WATCH webhook (server route).
//
// POST /api/google/calendar-webhook → receives Google Calendar push
// notifications. Verifies the channel token (shared secret echoed in
// X-Goog-Channel-Token) with a timing-safe compare and FAILS CLOSED (401) on
// mismatch (Part 2 — webhook verification). Processes each notification exactly
// once via the idempotency table (duplicate prevention), then runs an
// incremental sync for the affected calendar. Never trusts the body for identity.
// ============================================================================
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { stateSecret } from "@/lib/google/oauth";
import { recordWebhookOnce, findConnectionCalendarByChannel, syncCalendar } from "@/lib/google/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The shared secret we set as the watch channel `token`. */
function expectedChannelToken(): string {
  return process.env.GOOGLE_WEBHOOK_TOKEN?.trim() || crypto.createHash("sha256").update(`watch:${stateSecret()}`).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const channelToken = request.headers.get("x-goog-channel-token") ?? "";
  const resourceId = request.headers.get("x-goog-resource-id") ?? "";
  const resourceState = request.headers.get("x-goog-resource-state");
  const messageNumber = Number(request.headers.get("x-goog-message-number") ?? "0") || null;

  // Fail closed unless the channel token matches our shared secret.
  if (!channelId || !timingSafeEqual(channelToken, expectedChannelToken())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // The first "sync" handshake message carries no change — ack it.
  if (resourceState === "sync") return NextResponse.json({ ok: true });

  // Idempotency: process each (channel, message#) once.
  const first = await recordWebhookOnce(channelId, resourceId, messageNumber, resourceState);
  if (!first) return NextResponse.json({ ok: true, duplicate: true });

  const match = await findConnectionCalendarByChannel(channelId);
  if (match) {
    try { await syncCalendar(match.conn, match.calendarId); } catch { /* best-effort; Google will retry */ }
  }
  return NextResponse.json({ ok: true });
}
