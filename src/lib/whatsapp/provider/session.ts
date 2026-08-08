// ============================================================================
// 📘 ZONO — WhatsApp per-user SESSION persistence (server-only).
// ----------------------------------------------------------------------------
// Stores each broker's WhatsApp session state on their OWN whatsapp_accounts row
// (scoped organization_id + user_id, provider='whatsapp_web'). Never global,
// never shared. Only the opaque session_ref + non-secret connection snapshot are
// stored here — the actual WhatsApp session credentials live in the external
// bridge worker, never in ZONO's DB or client.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { getSessionContext } from "@/lib/auth/session";
import type { WaConnState, WaConnectionSnapshot, WaProviderKind, WaQr, WaSessionCtx } from "./types";

const PROVIDER = "whatsapp_web";

/**
 * DB client for the per-user session store. The snapshot (state + QR) is
 * per-user data the bridge webhook writes via the SERVICE ROLE; if reads here
 * used the RLS cookie client they could disagree with the writer (RLS on this
 * table proved unreliable in the Server-Component render path, hiding a valid
 * QR). So every session read/write goes through the service role, scoped
 * EXPLICITLY by (organization_id, user_id, provider) — the same isolation RLS
 * would give, and identical to how the webhook ingest writes. Falls back to the
 * RLS cookie client only when the service role isn't configured.
 */
async function sessionDb() {
  return isServiceRoleConfigured() ? createServiceRoleClient() : await createClient();
}

/** Resolve the caller's (org, user) session scope from the authenticated session. */
export async function resolveSessionCtx(): Promise<WaSessionCtx | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id || !profile.id) return null;
  return { orgId: profile.org_id, userId: profile.id };
}

interface StoredSession {
  ref: string | null;
  state: WaConnState;
  qr: WaQr | null;
  displayName: string | null;
  phone: string | null;
  lastConnectedAt: string | null;
  error: string | null;
}

interface AccountRow {
  id: string;
  connection_status: string | null;
  session_ref: string | null;
  last_connected_at: string | null;
  metadata: Record<string, unknown> | null;
}

function toSnapshot(kind: WaProviderKind, row: AccountRow | null): WaConnectionSnapshot {
  const s = ((row?.metadata as { wa_session?: StoredSession } | undefined)?.wa_session ?? null);
  return {
    providerKind: kind,
    state: (s?.state ?? "disconnected") as WaConnState,
    qr: s?.qr ?? null,
    displayName: s?.displayName ?? null,
    phone: s?.phone ?? null,
    lastConnectedAt: row?.last_connected_at ?? s?.lastConnectedAt ?? null,
    error: s?.error ?? null,
  };
}

/** Read the current broker's stored session row (their own, never another's). */
export async function readSessionRow(ctx: WaSessionCtx): Promise<AccountRow | null> {
  const db = await sessionDb();
  const { data, error } = await db.from("whatsapp_accounts" as never)
    .select("id,connection_status,session_ref,last_connected_at,metadata")
    .eq("organization_id", ctx.orgId).eq("provider", PROVIDER).eq("user_id", ctx.userId).maybeSingle();
  const row = (data as AccountRow | null) ?? null;
  console.log(`[wa-diag] readRow svc=${isServiceRoleConfigured()} err=${(error as { message?: string } | null)?.message ?? "none"} hasRow=${!!row} hasQr=${!!((row?.metadata as { wa_session?: { qr?: unknown } } | null)?.wa_session?.qr)}`);
  return row;
}

/** Read a client-safe snapshot of the current broker's session. */
export async function readSessionSnapshot(ctx: WaSessionCtx, kind: WaProviderKind): Promise<WaConnectionSnapshot> {
  return toSnapshot(kind, await readSessionRow(ctx));
}

/** Persist a session snapshot on the broker's own row (create if missing). */
export async function writeSession(ctx: WaSessionCtx, kind: WaProviderKind, patch: Partial<StoredSession>): Promise<void> {
  const db = await sessionDb();
  const row = await readSessionRow(ctx);
  const prev = ((row?.metadata as { wa_session?: StoredSession } | undefined)?.wa_session ?? {}) as Partial<StoredSession>;
  const merged: StoredSession = {
    ref: patch.ref ?? prev.ref ?? null,
    state: (patch.state ?? prev.state ?? "disconnected") as WaConnState,
    qr: patch.qr !== undefined ? patch.qr : (prev.qr ?? null),
    displayName: patch.displayName ?? prev.displayName ?? null,
    phone: patch.phone ?? prev.phone ?? null,
    lastConnectedAt: patch.lastConnectedAt ?? prev.lastConnectedAt ?? null,
    error: patch.error !== undefined ? patch.error : (prev.error ?? null),
  };
  const connectionStatus = merged.state === "connected" ? "connected" : merged.state === "error" ? "error" : "sandbox";
  const metadata = { ...((row?.metadata as Record<string, unknown> | undefined) ?? {}), wa_session: merged };
  const payload = {
    organization_id: ctx.orgId, user_id: ctx.userId, provider: PROVIDER, provider_kind: kind,
    connection_status: connectionStatus, session_ref: merged.ref,
    last_connected_at: merged.state === "connected" ? new Date().toISOString() : (row?.last_connected_at ?? null),
    metadata, approval_required: true,
  };
  if (row) await db.from("whatsapp_accounts" as never).update(payload as never).eq("id", row.id);
  else await db.from("whatsapp_accounts" as never).insert(payload as never);
}

/** Clear the broker's session (disconnect / delete). */
export async function clearSession(ctx: WaSessionCtx, hard: boolean): Promise<void> {
  const db = await sessionDb();
  const row = await readSessionRow(ctx);
  if (!row) return;
  if (hard) {
    await db.from("whatsapp_accounts" as never).delete().eq("id", row.id);
    return;
  }
  const metadata = {
    ...((row.metadata as Record<string, unknown> | undefined) ?? {}),
    wa_session: { ref: null, state: "disconnected", qr: null, displayName: null, phone: null, lastConnectedAt: row.last_connected_at, error: null } as StoredSession,
  };
  await db.from("whatsapp_accounts" as never).update({ connection_status: "sandbox", session_ref: null, metadata } as never).eq("id", row.id);
}
