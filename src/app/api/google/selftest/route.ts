// ============================================================================
// 🟦 ZONO OS — Batch 6.5 — TEMPORARY live self-test (owner-gated). REMOVE after
// bring-up. Exercises the real Google APIs with the connected token: calendar
// read/create(recurring+Meet+timezone+attendee)/update/delete, gmail
// read/send/reply, contacts read, and a forced token refresh. Returns a JSON
// report. Creates then DELETES the calendar event (no residue); gmail send/reply
// go to the connected account itself.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyConnection, decryptRefreshToken } from "@/lib/google/tokens";
import { getGoogleOAuthConfig, refreshAccessToken } from "@/lib/google/oauth";
import { listCalendars, listEventsRange, createEvent, updateEvent, deleteEvent } from "@/lib/google/calendar";
import { listThreads, sendMessage, replyToThread } from "@/lib/google/gmail";
import { listGoogleContacts } from "@/lib/google/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const step = async <T>(fn: () => Promise<T>): Promise<{ ok: boolean; data?: T; error?: string }> => {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
};

export async function GET() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await createClient();
  const { data: isManager } = await db.rpc("has_min_role", { p_min: "manager" });
  if (isManager !== true) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const conn = await getMyConnection();
  if (!conn || (conn.status !== "connected" && conn.status !== "syncing")) {
    return NextResponse.json({ ok: false, error: "not_connected", status: conn?.status ?? "none" }, { status: 409 });
  }
  const report: Record<string, unknown> = { account: conn.email };

  // ── Calendar ──────────────────────────────────────────────────────────────
  const cals = await listCalendars(conn);
  report.calendarRead = { ok: cals.length > 0, count: cals.length, primary: cals.find((c) => c.primary)?.id ?? null };
  const calId = cals.find((c) => c.primary)?.id ?? "primary";

  const start = new Date(Date.now() + 24 * 3600 * 1000); start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 3600 * 1000);
  const tz = "Asia/Jerusalem";
  const startDT = { dateTime: start.toISOString(), date: null, timeZone: tz };
  const endDT = { dateTime: end.toISOString(), date: null, timeZone: tz };

  const created = await createEvent(conn, calId, {
    summary: "[ZONO self-test] recurring+meet", description: "temporary self-test event",
    start: startDT, end: endDT, timeZone: tz,
    recurrence: ["RRULE:FREQ=DAILY;COUNT=2"], addMeet: true,
    attendees: [{ email: conn.email ?? "" }],
    reminders: [{ method: "popup", minutes: 10 }],
  } as never);
  report.calendarCreate = {
    ok: created.ok, id: created.event?.id ?? null, meetLink: created.event?.meetLink ?? null,
    hasRecurrence: !!created.event?.recurrence, timeZone: created.event?.start.timeZone ?? null,
    attendees: created.event?.attendees.length ?? 0, error: created.error?.message ?? null,
  };

  if (created.ok && created.event) {
    const evId = created.event.id;
    const upd = await updateEvent(conn, calId, evId, { summary: "[ZONO self-test] updated", start: startDT, end: endDT } as never);
    report.calendarUpdate = { ok: upd.ok, summary: upd.event?.summary ?? null, meetPreserved: !!upd.event?.meetLink, error: upd.error?.message ?? null };

    const range = await listEventsRange(conn, calId, new Date(Date.now() - 3600_000).toISOString(), new Date(Date.now() + 3 * 24 * 3600_000).toISOString());
    report.calendarReadBack = { ok: range.some((e) => e.recurringEventId === evId || e.id === evId || (e.summary ?? "").includes("ZONO self-test")), events: range.length };

    const del = await deleteEvent(conn, calId, evId);
    report.calendarDelete = { ok: del.ok, error: del.error?.message ?? null };
  }

  // ── Gmail ────────────────────────────────────────────────────────────────
  report.gmailRead = await step(async () => { const t = await listThreads(conn, { q: "in:inbox", max: 5 }); return { count: t.length, firstSubject: t[0]?.subject ?? null }; });
  const send = await sendMessage(conn, { to: conn.email ?? "", subject: "[ZONO self-test] send", body: "This is a ZONO Google integration self-test message." });
  report.gmailSend = { ok: send.ok, id: send.id, threadId: send.threadId, error: send.error };
  if (send.ok && send.threadId) {
    const reply = await replyToThread(conn, { threadId: send.threadId, to: conn.email ?? "", subject: "[ZONO self-test] send", body: "Self-test reply — preserves thread." });
    report.gmailReply = { ok: reply.ok, id: reply.id, sameThread: reply.threadId === send.threadId, error: reply.error };
  }

  // ── Contacts ─────────────────────────────────────────────────────────────
  report.contactsRead = await step(async () => { const c = await listGoogleContacts(conn, 25); return { count: c.length, withPhone: c.filter((x) => x.phones.length > 0).length, withOrg: c.filter((x) => x.organization).length }; });

  // ── Token refresh ────────────────────────────────────────────────────────
  report.tokenRefresh = await step(async () => {
    const cfg = getGoogleOAuthConfig();
    const refresh = decryptRefreshToken(conn);
    if (!refresh) throw new Error("no refresh token stored");
    const t = await refreshAccessToken(cfg, refresh);
    return { refreshed: !!t.accessToken, newExpiresInSec: t.expiresInSec };
  });

  return NextResponse.json({ ok: true, report });
}
