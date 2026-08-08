// ============================================================================
// 📘 ZONO — Bridge INBOUND ingest (server-only, service-role).
// ----------------------------------------------------------------------------
// Maps a provider (bridge) inbound message onto the EXISTING conversation model
// (whatsapp_conversations + whatsapp_messages) so the existing Inbox, AI
// Conversation Brain, Timeline, CRM linking, Drafts and Approval flow all keep
// working unchanged. It creates NO new inbox. Scoped strictly to the (org, user)
// that owns the session — a broker's messages land only in their own inbox.
// The webhook has no user session, so this uses the service-role client with an
// EXPLICIT, already-verified org/user.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import type { WaConnState, WaInboundMessage, WaQr, WaSessionCtx } from "./types";

const phoneHash = (phone: string): string =>
  crypto.createHash("sha256").update(phone.replace(/[^\d]/g, "")).digest("hex").slice(0, 40);

/** Confirm the (org, user) actually owns a whatsapp_web session row. Prevents a
 *  bridge payload from injecting into an org/user that never connected. */
async function ownsSession(db: ReturnType<typeof createServiceRoleClient>, ctx: WaSessionCtx): Promise<boolean> {
  const { data } = await db.from("whatsapp_accounts" as never).select("id")
    .eq("organization_id", ctx.orgId).eq("provider", "whatsapp_web").eq("user_id", ctx.userId).maybeSingle();
  return !!data;
}

/** Ingest one inbound message into the existing conversation model. */
export async function ingestBridgeMessage(ctx: WaSessionCtx, msg: WaInboundMessage): Promise<{ ok: boolean; conversationId?: string; reason?: string }> {
  if (!isServiceRoleConfigured()) return { ok: false, reason: "service_role" };
  const db = createServiceRoleClient();
  if (!(await ownsSession(db, ctx))) return { ok: false, reason: "no_session" };

  const hash = phoneHash(msg.fromPhone);
  // Resolve or create the conversation for this contact (this broker's inbox).
  const existing = await db.from("whatsapp_conversations" as never).select("id")
    .eq("organization_id", ctx.orgId).eq("assigned_agent_id", ctx.userId).eq("contact_phone_hash", hash).maybeSingle();
  let convId = (existing.data as { id: string } | null)?.id ?? null;
  const now = new Date().toISOString();

  if (!convId) {
    const created = await db.from("whatsapp_conversations" as never).insert({
      organization_id: ctx.orgId, assigned_agent_id: ctx.userId, contact_phone_hash: hash,
      contact_name: msg.contactName, channel: "whatsapp", state: "requires_reply",
      last_message: msg.text, last_message_at: now, last_inbound_at: now, unread: true, needs_response: true,
    } as never).select("id").maybeSingle();
    convId = (created.data as { id: string } | null)?.id ?? null;
  } else {
    await db.from("whatsapp_conversations" as never).update({
      last_message: msg.text, last_message_at: now, last_inbound_at: now, unread: true, needs_response: true, state: "requires_reply",
      ...(msg.contactName ? { contact_name: msg.contactName } : {}),
    } as never).eq("id", convId);
  }
  if (!convId) return { ok: false, reason: "conversation" };

  // Dedup by provider message id, then insert the inbound message.
  const dup = await db.from("whatsapp_messages" as never).select("id")
    .eq("organization_id", ctx.orgId).eq("conversation_id", convId)
    .filter("metadata->>provider_message_id", "eq", msg.providerMessageId).maybeSingle();
  if (dup.data) return { ok: true, conversationId: convId };

  await db.from("whatsapp_messages" as never).insert({
    organization_id: ctx.orgId, conversation_id: convId, direction: "inbound", source: "meta_api",
    body: msg.text, is_voice_note: msg.kind === "audio",
    metadata: { provider_message_id: msg.providerMessageId, from: msg.fromPhone, kind: msg.kind, media_ref: msg.mediaRef, via: "whatsapp_web_bridge" },
    created_at: msg.timestamp || now,
  } as never);
  return { ok: true, conversationId: convId };
}

/** Persist a fresh QR (pushed by the bridge's QRCODE_UPDATED event) onto the
 *  broker's own session snapshot so the connect screen can render it. Scoped
 *  strictly to the (org,user) resolved from the (authenticated, validated)
 *  instance name; never global/shared. Upserts the row when missing: Evolution
 *  emits the QR asynchronously right after instance creation — often before the
 *  connect call has finished writing the session row — so requiring a pre-existing
 *  row would drop the very first (and sometimes only) QR. */
export async function ingestBridgeQr(ctx: WaSessionCtx, qr: WaQr): Promise<{ ok: boolean }> {
  if (!isServiceRoleConfigured()) return { ok: false };
  const db = createServiceRoleClient();
  const row = await db.from("whatsapp_accounts" as never).select("id,metadata")
    .eq("organization_id", ctx.orgId).eq("provider", "whatsapp_web").eq("user_id", ctx.userId).maybeSingle();
  const r = row.data as { id: string; metadata: Record<string, unknown> | null } | null;
  const prev = ((r?.metadata as { wa_session?: Record<string, unknown> } | null)?.wa_session ?? {});
  const wa_session = { ...prev, state: "waiting_qr" as WaConnState, qr, error: null };
  if (r) {
    await db.from("whatsapp_accounts" as never).update({
      connection_status: "sandbox",
      metadata: { ...(r.metadata ?? {}), wa_session },
    } as never).eq("id", r.id);
  } else {
    await db.from("whatsapp_accounts" as never).insert({
      organization_id: ctx.orgId, user_id: ctx.userId, provider: "whatsapp_web", provider_kind: "bridge",
      connection_status: "sandbox", approval_required: true, metadata: { wa_session },
    } as never);
  }
  return { ok: true };
}

/** Update the stored per-user session snapshot from a bridge connection event. */
export async function ingestBridgeStatus(ctx: WaSessionCtx, state: WaConnState, extra: { displayName?: string | null; phone?: string | null; error?: string | null }): Promise<{ ok: boolean }> {
  if (!isServiceRoleConfigured()) return { ok: false };
  const db = createServiceRoleClient();
  const row = await db.from("whatsapp_accounts" as never).select("id,metadata,last_connected_at")
    .eq("organization_id", ctx.orgId).eq("provider", "whatsapp_web").eq("user_id", ctx.userId).maybeSingle();
  const r = row.data as { id: string; metadata: Record<string, unknown> | null; last_connected_at: string | null } | null;
  if (!r) return { ok: false };
  const prev = ((r.metadata as { wa_session?: Record<string, unknown> } | null)?.wa_session ?? {});
  const prevQr = (prev as { qr?: { expiresAt?: string } | null }).qr ?? null;
  const qrFresh = !!prevQr?.expiresAt && Date.parse(prevQr.expiresAt) > Date.now();
  // While a fresh QR is still held, transient "disconnected" updates (Baileys
  // emits close/disconnected BETWEEN QR refreshes before the phone scans) must
  // NOT flip the stored state to disconnected — the UI only shows the code when
  // the state is waiting_qr, so that would hide a perfectly valid QR. Keep
  // waiting_qr until we're truly connected (or the QR expires on its own TTL).
  const effectiveState: WaConnState = state === "disconnected" && qrFresh ? "waiting_qr" : state;
  const wa_session = {
    ...prev, state: effectiveState,
    displayName: extra.displayName ?? (prev as { displayName?: string }).displayName ?? null,
    phone: extra.phone ?? (prev as { phone?: string }).phone ?? null,
    error: extra.error ?? null,
    // Clear the QR only once truly connected. A genuinely stale QR expires on
    // its own (TTL → qr_expired); transient disconnects keep it.
    qr: state === "connected" ? null : (prev as { qr?: unknown }).qr ?? null,
  };
  await db.from("whatsapp_accounts" as never).update({
    connection_status: effectiveState === "connected" ? "connected" : effectiveState === "error" ? "error" : "sandbox",
    last_connected_at: state === "connected" ? new Date().toISOString() : r.last_connected_at,
    metadata: { ...(r.metadata ?? {}), wa_session },
  } as never).eq("id", r.id);
  return { ok: true };
}
