// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — Google Calendar client (server-only).
//
// Raw Google Calendar API v3 over authed fetch. Reads calendars + events,
// creates/updates/deletes events with recurrence (RRULE), attendees, timezone,
// reminders, and Google Meet links (conferenceData). Supports incremental sync
// (syncToken) and push channels (watch). Every write carries an idempotency
// request id so a retried create never produces a duplicate (Part 2). Degrades
// to honest empty results whenever no valid token exists — never fabricates.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { getValidAccessToken } from "./tokens";
import { extractMeetLink, meetCreateRequest } from "./meet";
import type { GoogleConnection, GoogleCalendarSummary, GoogleEvent, GoogleEventInput, GoogleErrorType } from "./types";

const BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarApiError { type: GoogleErrorType; message: string; status: number }
export type CalendarResult<T> = { ok: true; data: T } | { ok: false; error: CalendarApiError };

function classify(status: number, body: string): CalendarApiError {
  if (status === 401) return { type: "auth_expired", message: "unauthorized", status };
  if (status === 403) return { type: /insufficient|scope|permission/i.test(body) ? "permission" : "rate_limit", message: body.slice(0, 200), status };
  if (status === 410) return { type: "gone", message: "sync token invalid", status };
  if (status === 429) return { type: "rate_limit", message: "rate limited", status };
  return { type: "unknown", message: body.slice(0, 200), status };
}

/** Authed Calendar API call. Never logs the token. */
async function call<T>(conn: GoogleConnection, path: string, init?: RequestInit & { query?: Record<string, string> }): Promise<CalendarResult<T>> {
  const token = await getValidAccessToken(conn);
  if (!token) return { ok: false, error: { type: "auth_expired", message: "no valid token", status: 401 } };
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v != null) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, error: { type: "network", message: "network error", status: 0 } };
  }
  if (res.status === 204) return { ok: true, data: undefined as unknown as T };
  const text = await res.text();
  if (!res.ok) return { ok: false, error: classify(res.status, text) };
  try { return { ok: true, data: (text ? JSON.parse(text) : {}) as T }; }
  catch { return { ok: false, error: { type: "unknown", message: "bad json", status: res.status } }; }
}

// ── Parsing ───────────────────────────────────────────────────────────────────
interface RawEvent {
  id?: string; iCalUID?: string; etag?: string; status?: string; summary?: string; description?: string;
  location?: string; start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email?: string; displayName?: string; responseStatus?: string; organizer?: boolean }[];
  recurrence?: string[]; recurringEventId?: string; hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  reminders?: { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] };
  updated?: string; htmlLink?: string;
}

export function parseEvent(raw: RawEvent, calendarId: string): GoogleEvent {
  return {
    id: raw.id ?? "", calendarId, iCalUID: raw.iCalUID ?? null, etag: raw.etag ?? null,
    status: raw.status ?? null, summary: raw.summary ?? null, description: raw.description ?? null,
    location: raw.location ?? null,
    start: { dateTime: raw.start?.dateTime ?? null, date: raw.start?.date ?? null, timeZone: raw.start?.timeZone ?? null },
    end: { dateTime: raw.end?.dateTime ?? null, date: raw.end?.date ?? null, timeZone: raw.end?.timeZone ?? null },
    attendees: (raw.attendees ?? []).filter((a) => !!a.email).map((a) => ({
      email: a.email as string, displayName: a.displayName ?? null, responseStatus: a.responseStatus ?? null, organizer: a.organizer === true,
    })),
    recurrence: raw.recurrence ?? null, recurringEventId: raw.recurringEventId ?? null,
    meetLink: extractMeetLink(raw.hangoutLink, raw.conferenceData),
    reminders: raw.reminders?.overrides?.map((r) => ({ method: r.method ?? "popup", minutes: r.minutes ?? 0 })) ?? null,
    updated: raw.updated ?? null, htmlLink: raw.htmlLink ?? null,
  };
}

function toRawBody(input: GoogleEventInput, requestId: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: input.start,
    end: input.end,
    attendees: input.attendees?.map((a) => ({ email: a.email, displayName: a.displayName ?? undefined })),
    recurrence: input.recurrence ?? undefined,                     // RRULE lines (recurring events)
    reminders: input.reminders ? { useDefault: false, overrides: input.reminders } : undefined,
    // Round-trip marker + idempotency key stored ON the Google event.
    extendedProperties: { private: { zono_request_id: requestId, ...(input.internalRef ? { zono_internal_ref: input.internalRef } : {}) } },
  };
  if (input.addMeet) body.conferenceData = meetCreateRequest(requestId);
  return body;
}

// ── Calendars ─────────────────────────────────────────────────────────────────
export async function listCalendars(conn: GoogleConnection): Promise<GoogleCalendarSummary[]> {
  const r = await call<{ items?: { id?: string; summary?: string; primary?: boolean; timeZone?: string; accessRole?: string; selected?: boolean }[] }>(
    conn, "/users/me/calendarList", { query: { maxResults: "250" } });
  if (!r.ok) return [];
  return (r.data.items ?? []).filter((c) => !!c.id).map((c) => ({
    id: c.id as string, summary: c.summary ?? "(no name)", primary: c.primary === true,
    timeZone: c.timeZone ?? null, accessRole: c.accessRole ?? null, selected: c.selected !== false,
  }));
}

// ── Events — read ───────────────────────────────────────────────────────────
export async function listEventsRange(conn: GoogleConnection, calendarId: string, timeMin: string, timeMax: string): Promise<GoogleEvent[]> {
  const r = await call<{ items?: RawEvent[] }>(conn, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    query: { timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "2500" },
  });
  if (!r.ok) return [];
  return (r.data.items ?? []).map((e) => parseEvent(e, calendarId));
}

export interface IncrementalPage {
  events: GoogleEvent[];
  deletedIds: string[];
  nextSyncToken: string | null;
  fullResyncRequired: boolean;
  error: CalendarApiError | null;
}

/** Incremental sync using a stored syncToken. On 410 the token is stale →
 *  fullResyncRequired so the caller re-lists from scratch. singleEvents=false
 *  preserves recurring masters (RRULE); showDeleted=true surfaces deletions. */
export async function listEventsIncremental(conn: GoogleConnection, calendarId: string, syncToken: string | null): Promise<IncrementalPage> {
  const query: Record<string, string> = { singleEvents: "false", showDeleted: "true", maxResults: "2500" };
  if (syncToken) query.syncToken = syncToken; else query.timeMin = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString();
  const r = await call<{ items?: RawEvent[]; nextSyncToken?: string }>(conn, `/calendars/${encodeURIComponent(calendarId)}/events`, { query });
  if (!r.ok) {
    return { events: [], deletedIds: [], nextSyncToken: null, fullResyncRequired: r.error.type === "gone", error: r.error };
  }
  const items = r.data.items ?? [];
  const events = items.filter((e) => e.status !== "cancelled").map((e) => parseEvent(e, calendarId));
  const deletedIds = items.filter((e) => e.status === "cancelled" && e.id).map((e) => e.id as string);
  return { events, deletedIds, nextSyncToken: r.data.nextSyncToken ?? null, fullResyncRequired: false, error: null };
}

// ── Events — write (idempotent) ─────────────────────────────────────────────
export interface WriteResult { ok: boolean; event: GoogleEvent | null; requestId: string; error: CalendarApiError | null }

/** Create an event. `requestId` (caller-provided for idempotency) is written to
 *  the event's extendedProperties AND used as the Meet createRequest id, so a
 *  retried create is safe. conferenceDataVersion=1 enables Meet link creation. */
export async function createEvent(conn: GoogleConnection, calendarId: string, input: GoogleEventInput, requestId?: string): Promise<WriteResult> {
  const rid = requestId ?? crypto.randomUUID();
  const r = await call<RawEvent>(conn, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    query: { conferenceDataVersion: input.addMeet ? "1" : "0", sendUpdates: "all" },
    body: JSON.stringify(toRawBody(input, rid)),
  });
  if (!r.ok) return { ok: false, event: null, requestId: rid, error: r.error };
  return { ok: true, event: parseEvent(r.data, calendarId), requestId: rid, error: null };
}

/** Update an event. PATCH preserves fields we don't send — so an existing Meet
 *  link (conferenceData) is preserved unless the caller changes it (Part 5). */
export async function updateEvent(conn: GoogleConnection, calendarId: string, eventId: string, input: GoogleEventInput, requestId?: string): Promise<WriteResult> {
  const rid = requestId ?? crypto.randomUUID();
  const body = toRawBody(input, rid);
  if (!input.addMeet) delete (body as { conferenceData?: unknown }).conferenceData;   // never strip an existing Meet link
  const r = await call<RawEvent>(conn, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    query: { conferenceDataVersion: "1", sendUpdates: "all" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, event: null, requestId: rid, error: r.error };
  return { ok: true, event: parseEvent(r.data, calendarId), requestId: rid, error: null };
}

export async function deleteEvent(conn: GoogleConnection, calendarId: string, eventId: string): Promise<{ ok: boolean; error: CalendarApiError | null }> {
  const r = await call<void>(conn, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE", query: { sendUpdates: "all" },
  });
  // A 410 on delete means already gone → treat as success (idempotent delete).
  if (!r.ok && r.error.type !== "gone") return { ok: false, error: r.error };
  return { ok: true, error: null };
}

// ── Watch channels (push notifications) ──────────────────────────────────────
export interface WatchResult { ok: boolean; channelId: string | null; resourceId: string | null; expiration: string | null; error: CalendarApiError | null }

/** Open a push channel so Google POSTs to our webhook on changes (Part 2/6).
 *  `token` is a shared secret echoed back in X-Goog-Channel-Token for verification. */
export async function watchCalendar(conn: GoogleConnection, calendarId: string, webhookUrl: string, token: string): Promise<WatchResult> {
  const channelId = crypto.randomUUID();
  const r = await call<{ resourceId?: string; expiration?: string }>(conn, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id: channelId, type: "web_hook", address: webhookUrl, token }),
  });
  if (!r.ok) return { ok: false, channelId: null, resourceId: null, expiration: null, error: r.error };
  const exp = r.data.expiration ? new Date(Number(r.data.expiration)).toISOString() : null;
  return { ok: true, channelId, resourceId: r.data.resourceId ?? null, expiration: exp, error: null };
}

export async function stopChannel(conn: GoogleConnection, channelId: string, resourceId: string): Promise<boolean> {
  const r = await call<void>(conn, "/channels/stop", { method: "POST", body: JSON.stringify({ id: channelId, resourceId }) });
  return r.ok;
}
