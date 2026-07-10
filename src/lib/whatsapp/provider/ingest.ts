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
import type { WaConnState, WaInboundMessage, WaSessionCtx } from "./types";

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

/** Update the stored per-user session snapshot from a bridge connection event. */
export async function ingestBridgeStatus(ctx: WaSessionCtx, state: WaConnState, extra: { displayName?: string | null; phone?: string | null; error?: string | null }): Promise<{ ok: boolean }> {
  if (!isServiceRoleConfigured()) return { ok: false };
  const db = createServiceRoleClient();
  const row = await db.from("whatsapp_accounts" as never).select("id,metadata,last_connected_at")
    .eq("organization_id", ctx.orgId).eq("provider", "whatsapp_web").eq("user_id", ctx.userId).maybeSingle();
  const r = row.data as { id: string; metadata: Record<string, unknown> | null; last_connected_at: string | null } | null;
  if (!r) return { ok: false };
  const prev = ((r.metadata as { wa_session?: Record<string, unknown> } | null)?.wa_session ?? {});
  const wa_session = {
    ...prev, state,
    displayName: extra.displayName ?? (prev as { displayName?: string }).displayName ?? null,
    phone: extra.phone ?? (prev as { phone?: string }).phone ?? null,
    error: extra.error ?? null,
    qr: state === "connected" || state === "disconnected" ? null : (prev as { qr?: unknown }).qr ?? null,
  };
  await db.from("whatsapp_accounts" as never).update({
    connection_status: state === "connected" ? "connected" : state === "error" ? "error" : "sandbox",
    last_connected_at: state === "connected" ? new Date().toISOString() : r.last_connected_at,
    metadata: { ...(r.metadata ?? {}), wa_session },
  } as never).eq("id", r.id);
  return { ok: true };
}
