// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — sync engine (server-only).
//
// Bidirectional calendar sync. GOOGLE is the source of truth for Google-created
// entities: an incoming event is upserted into google_synced_events keyed by
// (connection, calendar, google_event_id) so it can never be imported twice
// (duplicate detection), and a changed etag is treated as Google winning
// (conflict detection). Outbound creates are IDEMPOTENT: a create carrying an
// internalRef that already maps to a Google event returns the existing mapping
// instead of creating a second event. Incremental sync uses stored syncTokens;
// a stale token (410) triggers a full resync. Bounded retry; sync health stamped.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  listEventsIncremental, createEvent, type WriteResult,
} from "./calendar";
import { markSynced, setConnectionStatus } from "./tokens";
import type { GoogleConnection, GoogleEvent, GoogleEventInput, SyncResult } from "./types";

const SYNC_TABLE = "google_calendar_sync";
const EVENTS_TABLE = "google_synced_events";

// ── Event mapping store (duplicate prevention + idempotency) ─────────────────
interface EventMapRow {
  id: string; connection_id: string; google_calendar_id: string; google_event_id: string;
  ical_uid: string | null; etag: string | null; request_id: string | null; internal_ref: string | null;
  has_meet: boolean; status: string | null; google_updated_at: string | null;
}

async function getMappingByInternalRef(conn: GoogleConnection, calendarId: string, internalRef: string): Promise<EventMapRow | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from(EVENTS_TABLE as never).select("*")
    .eq("connection_id", conn.id).eq("google_calendar_id", calendarId).eq("internal_ref", internalRef).maybeSingle();
  return (data as unknown as EventMapRow) ?? null;
}

async function getMappingByEventId(conn: GoogleConnection, calendarId: string, eventId: string): Promise<EventMapRow | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from(EVENTS_TABLE as never).select("*")
    .eq("connection_id", conn.id).eq("google_calendar_id", calendarId).eq("google_event_id", eventId).maybeSingle();
  return (data as unknown as EventMapRow) ?? null;
}

/** Upsert an event mapping. The unique (connection,calendar,event) constraint is
 *  the hard duplicate guard; this keeps etag/updated fresh for conflict checks. */
async function upsertMapping(conn: GoogleConnection, ev: GoogleEvent, extra?: { requestId?: string; internalRef?: string | null }): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(EVENTS_TABLE as never).upsert({
    connection_id: conn.id, org_id: conn.orgId, google_calendar_id: ev.calendarId, google_event_id: ev.id,
    ical_uid: ev.iCalUID, etag: ev.etag, request_id: extra?.requestId ?? null, internal_ref: extra?.internalRef ?? null,
    has_meet: !!ev.meetLink, status: ev.status, google_updated_at: ev.updated,
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "connection_id,google_calendar_id,google_event_id" } as never);
}

async function deleteMapping(conn: GoogleConnection, calendarId: string, eventId: string): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(EVENTS_TABLE as never).delete().eq("connection_id", conn.id).eq("google_calendar_id", calendarId).eq("google_event_id", eventId);
}

// ── Calendar sync-state store ─────────────────────────────────────────────────
async function getSyncToken(conn: GoogleConnection, calendarId: string): Promise<string | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from(SYNC_TABLE as never).select("sync_token").eq("connection_id", conn.id).eq("google_calendar_id", calendarId).maybeSingle();
  return (data as unknown as { sync_token: string | null })?.sync_token ?? null;
}

async function saveSyncState(conn: GoogleConnection, calendarId: string, syncToken: string | null, status: string): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(SYNC_TABLE as never).upsert({
    connection_id: conn.id, org_id: conn.orgId, google_calendar_id: calendarId,
    sync_token: syncToken, last_sync_at: new Date().toISOString(), last_status: status, updated_at: new Date().toISOString(),
  } as never, { onConflict: "connection_id,google_calendar_id" } as never);
}

// ── Incremental sync (inbound: Google → us) ─────────────────────────────────
/**
 * Sync one calendar. Uses the stored syncToken for an incremental pull; on a
 * stale token (410) it clears and does a full resync. Every event is upserted
 * through the unique mapping (duplicate detection); an etag change counts as a
 * conflict resolved in Google's favor (source of truth). Bounded single retry
 * on transient errors.
 */
export async function syncCalendar(conn: GoogleConnection, calendarId: string, opts: { fullResync?: boolean; retry?: number } = {}): Promise<SyncResult> {
  const result: SyncResult = { outcome: "ok", calendarId, imported: 0, updated: 0, deleted: 0, duplicatesSkipped: 0, conflicts: 0, nextSyncToken: null, error: null };
  await setConnectionStatus(conn.id, "syncing");

  const token = opts.fullResync ? null : await getSyncToken(conn, calendarId);
  const page = await listEventsIncremental(conn, calendarId, token);

  if (page.error) {
    if (page.fullResyncRequired) {
      await saveSyncState(conn, calendarId, null, "full_resync");
      const full = await syncCalendar(conn, calendarId, { fullResync: true, retry: opts.retry });
      return { ...full, outcome: "full_resync" };
    }
    if (page.error.type === "auth_expired" || page.error.type === "revoked") {
      await setConnectionStatus(conn.id, page.error.type === "revoked" ? "revoked" : "expired", page.error.message);
      return { ...result, outcome: "auth_error", error: page.error.message };
    }
    if (page.error.type === "permission") {
      await setConnectionStatus(conn.id, "permission_missing", page.error.message);
      return { ...result, outcome: "permission_missing", error: page.error.message };
    }
    // Transient (rate_limit/network/unknown): one bounded retry.
    if ((opts.retry ?? 0) < 1) return syncCalendar(conn, calendarId, { ...opts, retry: (opts.retry ?? 0) + 1 });
    await setConnectionStatus(conn.id, "connected", page.error.message);
    return { ...result, outcome: "error", error: page.error.message };
  }

  for (const ev of page.events) {
    const existing = await getMappingByEventId(conn, calendarId, ev.id);
    if (!existing) { await upsertMapping(conn, ev); result.imported += 1; continue; }
    if (existing.etag && ev.etag && existing.etag !== ev.etag) { await upsertMapping(conn, ev); result.updated += 1; result.conflicts += 1; }  // Google wins
    else { result.duplicatesSkipped += 1; }                                                                                                   // already have it → no dup
  }
  for (const delId of page.deletedIds) { await deleteMapping(conn, calendarId, delId); result.deleted += 1; }

  await saveSyncState(conn, calendarId, page.nextSyncToken, "ok");
  await markSynced(conn.id);
  return { ...result, nextSyncToken: page.nextSyncToken };
}

// ── Idempotent outbound create (our → Google) ───────────────────────────────
export interface IdempotentCreate { ok: boolean; event: GoogleEvent | null; duplicate: boolean; error: string | null }

/**
 * Create an event idempotently. If `internalRef` already maps to a Google event
 * on this calendar, the existing mapping is returned (duplicate=true) and NO
 * second event is created. Otherwise the event is created (carrying a request id
 * for Google-side idempotency) and the mapping is recorded.
 */
export async function createEventIdempotent(conn: GoogleConnection, calendarId: string, input: GoogleEventInput): Promise<IdempotentCreate> {
  if (input.internalRef) {
    const existing = await getMappingByInternalRef(conn, calendarId, input.internalRef);
    if (existing) {
      return { ok: true, event: null, duplicate: true, error: null };   // already synced → never duplicate
    }
  }
  const res: WriteResult = await createEvent(conn, calendarId, input);
  if (!res.ok || !res.event) return { ok: false, event: null, duplicate: false, error: res.error?.message ?? "create failed" };
  await upsertMapping(conn, res.event, { requestId: res.requestId, internalRef: input.internalRef ?? null });
  return { ok: true, event: res.event, duplicate: false, error: null };
}

// ── Sync health (Part 6/8) ────────────────────────────────────────────────────
export interface CalendarSyncHealth { calendarId: string; lastSyncAt: string | null; lastStatus: string | null; hasToken: boolean }

export async function getSyncHealth(conn: GoogleConnection): Promise<CalendarSyncHealth[]> {
  const db = createServiceRoleClient();
  const { data } = await db.from(SYNC_TABLE as never).select("google_calendar_id,last_sync_at,last_status,sync_token").eq("connection_id", conn.id);
  return ((data as unknown as Array<{ google_calendar_id: string; last_sync_at: string | null; last_status: string | null; sync_token: string | null }>) ?? []).map((r) => ({
    calendarId: r.google_calendar_id, lastSyncAt: r.last_sync_at, lastStatus: r.last_status, hasToken: !!r.sync_token,
  }));
}

/** Full resync of every selected calendar (Part 6). */
export async function fullResyncAll(conn: GoogleConnection, calendarIds: string[]): Promise<SyncResult[]> {
  const out: SyncResult[] = [];
  for (const id of calendarIds) out.push(await syncCalendar(conn, id, { fullResync: true }));
  return out;
}

// ── Webhook plumbing (push channel → calendar) ───────────────────────────────
const RECEIPTS_TABLE = "google_webhook_receipts";

/** Record a watch notification exactly once (idempotency). Returns true if this
 *  is the FIRST time we've seen (channelId, messageNumber) — false on replay. */
export async function recordWebhookOnce(channelId: string, resourceId: string, messageNumber: number | null, resourceState: string | null): Promise<boolean> {
  const db = createServiceRoleClient();
  const { error } = await db.from(RECEIPTS_TABLE as never).insert({
    channel_id: channelId, resource_id: resourceId, message_number: messageNumber, resource_state: resourceState,
  } as never);
  // A unique-violation means we already processed this exact notification.
  return !error;
}

/** Resolve a push channel id back to its connection + calendar. */
export async function findConnectionCalendarByChannel(channelId: string): Promise<{ conn: GoogleConnection; calendarId: string } | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from(SYNC_TABLE as never).select("connection_id,google_calendar_id").eq("channel_id", channelId).maybeSingle();
  const row = data as unknown as { connection_id: string; google_calendar_id: string } | null;
  if (!row) return null;
  const { data: c } = await db.from("google_connections" as never).select("*").eq("id", row.connection_id).maybeSingle();
  if (!c) return null;
  const r = c as unknown as {
    id: string; org_id: string; user_id: string; google_sub: string | null; email: string | null; display_name: string | null;
    scopes: string[] | null; access_token_encrypted: string | null; refresh_token_encrypted: string | null;
    token_expires_at: string | null; status: string; last_sync_at: string | null; last_error: string | null; metadata: Record<string, unknown> | null;
  };
  const conn: GoogleConnection = {
    id: r.id, orgId: r.org_id, userId: r.user_id, googleSub: r.google_sub, email: r.email, displayName: r.display_name,
    scopes: r.scopes ?? [], accessTokenEncrypted: r.access_token_encrypted, refreshTokenEncrypted: r.refresh_token_encrypted,
    tokenExpiresAt: r.token_expires_at, status: r.status as GoogleConnection["status"], lastSyncAt: r.last_sync_at,
    lastError: r.last_error, metadata: r.metadata ?? {},
  };
  return { conn, calendarId: row.google_calendar_id };
}
