// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — Gmail actions (server route).
//
// POST /api/google/gmail → send / reply / mark-read, on the current user's
// connection only. Session-guarded; the connection is loaded server-side from
// the session identity (never from the request body), so one user can never act
// as another. GET returns a small honest status ping. Tokens never touch the
// request/response — the Gmail client resolves them server-side.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getMyConnection } from "@/lib/google/tokens";
import { sendMessage, replyToThread, setThreadUnread } from "@/lib/google/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const conn = await getMyConnection();
  return NextResponse.json({ service: "google-gmail", connected: !!conn && (conn.status === "connected" || conn.status === "syncing"), status: conn?.status ?? "disconnected" });
}

export async function POST(request: Request) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const conn = await getMyConnection();
  if (!conn || (conn.status !== "connected" && conn.status !== "syncing")) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 409 });
  }

  let body: { action?: string; to?: string; subject?: string; text?: string; threadId?: string; unread?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 }); }

  switch (body.action) {
    case "send": {
      if (!body.to || !body.text) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
      const r = await sendMessage(conn, { to: body.to, subject: body.subject ?? "", body: body.text });
      return NextResponse.json(r, { status: r.ok ? 200 : 502 });
    }
    case "reply": {
      if (!body.threadId || !body.to || !body.text) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
      const r = await replyToThread(conn, { threadId: body.threadId, to: body.to, subject: body.subject ?? "", body: body.text });
      return NextResponse.json(r, { status: r.ok ? 200 : 502 });
    }
    case "mark_read": {
      if (!body.threadId) return NextResponse.json({ ok: false, error: "missing_thread" }, { status: 400 });
      const ok = await setThreadUnread(conn, body.threadId, body.unread === true);
      return NextResponse.json({ ok });
    }
    default:
      return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
}
