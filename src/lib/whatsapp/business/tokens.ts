// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS — token store + lifecycle
// (server-only).
//
// The ONE per-org home for the WhatsApp Business access token. Reuses the
// EXISTING distribution_provider_connections table (provider='whatsapp',
// org-scoped, encrypted token column) — no new token table. WABA/phone metadata
// + webhook health reuse the EXISTING whatsapp_accounts table (so the frozen
// webhook processor keeps routing by phone_number_id). Tokens are encrypted at
// rest (AES-256-GCM, reused from src/lib/security/crypto), decrypted only here to
// make a Graph call, and never logged or sent to the browser (Part 8).
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/lib/security/crypto";
import { healthForStatus } from "./health";
import type { WaConnection, WaConnectionPublic, WaConnectionStatus } from "./types";

const CONN_TABLE = "distribution_provider_connections";
const ACCT_TABLE = "whatsapp_accounts";
const PROVIDER = "whatsapp";

interface ConnRow {
  id: string; org_id: string; provider: string; status: string; external_account_id: string | null;
  access_token_encrypted: string | null; token_expires_at: string | null; scopes: string[] | null;
  metadata: Record<string, unknown> | null; last_validated_at: string | null;
}

function toConnection(r: ConnRow): WaConnection {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  return {
    id: r.id, orgId: r.org_id, status: (r.status as WaConnectionStatus) ?? "disconnected",
    businessId: (m.business_id as string) ?? null, wabaId: (m.waba_id as string) ?? r.external_account_id ?? null,
    phoneNumberId: (m.phone_number_id as string) ?? null, displayPhoneNumber: (m.display_phone_number as string) ?? null,
    verifiedName: (m.verified_name as string) ?? null, scopes: r.scopes ?? [],
    accessTokenEncrypted: r.access_token_encrypted, tokenExpiresAt: r.token_expires_at,
    lastValidatedAt: r.last_validated_at, metadata: m,
  };
}

/** The current session's org id. Null when unauthenticated. */
export async function currentOrgId(): Promise<string | null> {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return null;
  return sc.profile.org_id;
}

/** Load the org's WhatsApp connection via the RLS client (browser session). */
export async function getConnection(): Promise<WaConnection | null> {
  const db = await createClient();
  const { data } = await db.from(CONN_TABLE as never).select("*").eq("provider", PROVIDER).maybeSingle();
  return data ? toConnection(data as unknown as ConnRow) : null;
}

/** Load a specific org's connection via the service role (webhook / notify). */
export async function getConnectionServiceRole(orgId: string): Promise<WaConnection | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from(CONN_TABLE as never).select("*").eq("org_id", orgId).eq("provider", PROVIDER).maybeSingle();
  return data ? toConnection(data as unknown as ConnRow) : null;
}

export interface StoreConnectionInput {
  orgId: string; createdBy: string | null; accessToken: string; expiresInSec: number | null; scopes: string[];
  businessId: string | null; wabaId: string | null; phoneNumberId: string | null;
  displayPhoneNumber: string | null; verifiedName: string | null; status: WaConnectionStatus;
}

/** Persist / upsert the encrypted connection (service-role). Also mirrors the
 *  non-secret WABA/phone routing metadata into whatsapp_accounts so the existing
 *  webhook processor can resolve phone_number_id → org. */
export async function storeConnection(input: StoreConnectionInput): Promise<void> {
  if (!isEncryptionConfigured()) throw new Error("ZONO_ENCRYPTION_KEY not configured — refusing to store WhatsApp token in plaintext.");
  const db = createServiceRoleClient();
  const expiresAt = input.expiresInSec ? new Date(Date.now() + input.expiresInSec * 1000).toISOString() : null;
  await db.from(CONN_TABLE as never).upsert({
    org_id: input.orgId, provider: PROVIDER, status: input.status, connection_mode: "api",
    display_name: input.verifiedName ?? input.displayPhoneNumber ?? "WhatsApp Business",
    external_account_id: input.wabaId, access_token_encrypted: encryptSecret(input.accessToken),
    token_expires_at: expiresAt, scopes: input.scopes, created_by: input.createdBy,
    last_validated_at: new Date().toISOString(),
    metadata: {
      business_id: input.businessId, waba_id: input.wabaId, phone_number_id: input.phoneNumberId,
      display_phone_number: input.displayPhoneNumber, verified_name: input.verifiedName,
    },
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "org_id,provider" } as never);

  // Mirror routing metadata into whatsapp_accounts (phone_number_id → org) so the
  // EXISTING cloud webhook can resolve tenants. Never stores the token here.
  if (input.phoneNumberId) {
    await db.from(ACCT_TABLE as never).upsert({
      organization_id: input.orgId, phone_number_id: input.phoneNumberId, waba_id: input.wabaId,
      business_account_id: input.businessId, display_phone_number: input.displayPhoneNumber,
    } as never, { onConflict: "phone_number_id" } as never);
  }
}

/** Update just the connection status (health). Never clobbers the connection
 *  metadata (business_id / waba_id / phone_number_id stay intact). */
export async function setStatus(orgId: string, status: WaConnectionStatus): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(CONN_TABLE as never).update({
    status, last_validated_at: new Date().toISOString(),
  } as never).eq("org_id", orgId).eq("provider", PROVIDER);
}

/** Disconnect: clear the encrypted token, keep the row as an audit trail. */
export async function clearConnection(orgId: string): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(CONN_TABLE as never).update({
    access_token_encrypted: null, token_expires_at: null, status: "disconnected",
  } as never).eq("org_id", orgId).eq("provider", PROVIDER);
}

/** Decrypt the access token (server-only, in-memory). */
export function decryptToken(conn: WaConnection): string | null {
  if (!conn.accessTokenEncrypted) return null;
  try { return decryptSecret(conn.accessTokenEncrypted); } catch { return null; }
}

/** Webhook health from whatsapp_accounts (last_webhook_at) + last message. */
export async function readAccountHealth(orgId: string): Promise<{ lastWebhookAt: string | null; lastMessageAt: string | null }> {
  const db = createServiceRoleClient();
  const { data: acct } = await db.from(ACCT_TABLE as never).select("last_webhook_at").eq("organization_id", orgId).maybeSingle();
  const { data: msg } = await db.from("whatsapp_messages" as never).select("created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return {
    lastWebhookAt: (acct as unknown as { last_webhook_at: string | null })?.last_webhook_at ?? null,
    lastMessageAt: (msg as unknown as { created_at: string | null })?.created_at ?? null,
  };
}

/** Browser-safe projection — NEVER includes a token. */
export function toPublic(conn: WaConnection | null, health?: { lastWebhookAt: string | null; lastMessageAt: string | null }): WaConnectionPublic {
  if (!conn) {
    return { connected: false, status: "disconnected", health: "not_connected", businessId: null, wabaId: null, phoneNumberId: null, displayPhoneNumber: null, verifiedName: null, scopes: [], lastValidatedAt: null, lastWebhookAt: null, lastMessageAt: null };
  }
  return {
    connected: conn.status === "connected" || conn.status === "syncing",
    status: conn.status, health: healthForStatus(conn.status),
    businessId: conn.businessId, wabaId: conn.wabaId, phoneNumberId: conn.phoneNumberId,
    displayPhoneNumber: conn.displayPhoneNumber, verifiedName: conn.verifiedName, scopes: conn.scopes,
    lastValidatedAt: conn.lastValidatedAt, lastWebhookAt: health?.lastWebhookAt ?? null, lastMessageAt: health?.lastMessageAt ?? null,
  };
}
