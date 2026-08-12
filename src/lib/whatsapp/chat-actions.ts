// ============================================================================
// 📘 ZONO — WhatsApp CONVERSATION CENTER · server actions (neutral).
// ----------------------------------------------------------------------------
// The per-agent entry points the conversation center UI calls. Two worlds:
//   • ZONO conversations — the shared whatsapp_conversations/messages model that
//     the Inbox, AI Brain, Timeline and CRM already use. Threads + replies here.
//   • REMOTE reads — the connected account's EXISTING WhatsApp chats + contacts,
//     surfaced through the NEUTRAL personal-transport surface. No Evolution shape
//     appears here: only canonical {phone,name,lastMessage,at,body,direction}.
// Every action re-resolves the caller's (org,user) scope server-side and never
// throws to the client (defensive [] / {ok:false} on any failure).
// ============================================================================
"use server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { resolveSessionCtx } from "./provider/session";
import { personalSendAction } from "./provider/personal/actions";
import {
  personalFetchChats, personalFetchChatMessages, personalFetchContacts,
} from "./provider/personal";

const NO_AUTH = "אין הרשאה.";

// Mirrors the personal transport's contact keying so a conversation created by a
// send can be re-found here to remember its plaintext phone (for later replies).
const phoneHash = (phone: string): string =>
  crypto.createHash("sha256").update(phone.replace(/[^\d]/g, "")).digest("hex").slice(0, 40);

// ── ZONO conversations (shared model) ────────────────────────────────────────

/** A ZONO conversation summary. Carries NO phone (contact is stored hashed). */
export interface WaChatConv { id: string; name: string | null; lastMessage: string | null; at: string | null }

/** List the current agent's open ZONO conversations (newest first). */
export async function waChatListAction(): Promise<WaChatConv[]> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return [];
  try {
    const db = await createClient();
    const { data } = await db.from("whatsapp_conversations")
      .select("id,contact_name,last_message,last_message_at")
      .eq("organization_id", ctx.orgId).eq("assigned_agent_id", ctx.userId).neq("state", "closed")
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
    return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      name: (c.contact_name as string) ?? null,
      lastMessage: (c.last_message as string) ?? null,
      at: (c.last_message_at as string) ?? null,
    }));
  } catch { return []; }
}

/** Load a ZONO conversation's message thread (oldest first). */
export async function waChatThreadAction(conversationId: string): Promise<{ id: string; direction: string; body: string; at: string | null }[]> {
  const ctx = await resolveSessionCtx();
  if (!ctx || !conversationId) return [];
  try {
    const db = await createClient();
    const { data } = await db.from("whatsapp_messages")
      .select("id,direction,body,created_at")
      .eq("organization_id", ctx.orgId).eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }).limit(200);
    return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      direction: (m.direction as string) ?? "inbound",
      body: (m.body as string) ?? "",
      at: (m.created_at as string) ?? null,
    }));
  } catch { return []; }
}

/** Start a new chat: send the first (approved) message to a phone. Also remembers
 *  the plaintext phone on the conversation so replies can resolve it later. */
export async function waChatStartAction(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false, error: NO_AUTH };
  const r = await personalSendAction(phone, text, true);
  if (!r.ok) return { ok: false, error: r.error };
  try {
    const db = await createClient();
    const hash = phoneHash(phone);
    const { data } = await db.from("whatsapp_conversations")
      .select("id,metadata")
      .eq("organization_id", ctx.orgId).eq("assigned_agent_id", ctx.userId).eq("contact_phone_hash", hash).maybeSingle();
    const row = data as { id: string; metadata: Record<string, unknown> | null } | null;
    if (row && (row.metadata?.contact_phone !== phone)) {
      const metadata = { ...(row.metadata ?? {}), contact_phone: phone };
      await db.from("whatsapp_conversations").update({ metadata } as never).eq("id", row.id);
    }
  } catch { /* best-effort — send already succeeded */ }
  return { ok: true };
}

/** Reply within a ZONO conversation (resolves the phone stored at start time). */
export async function waChatSendReplyAction(conversationId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false, error: NO_AUTH };
  try {
    const db = await createClient();
    const { data } = await db.from("whatsapp_conversations")
      .select("metadata").eq("organization_id", ctx.orgId).eq("id", conversationId).maybeSingle();
    const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const phone = typeof meta.contact_phone === "string" ? meta.contact_phone : null;
    if (!phone) return { ok: false, error: "לא נמצא מספר טלפון לשיחה זו." };
    const r = await personalSendAction(phone, text, true);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch { return { ok: false, error: "שליחה נכשלה." }; }
}

// ── Remote reads (connected account's existing WhatsApp) ─────────────────────

/** A contact from the connected account's address book. */
export interface WaContact { phone: string; name: string | null }

/** The connected account's contacts (personal only), sorted by name, capped. */
export async function waContactsAction(): Promise<WaContact[]> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return [];
  const r = await personalFetchContacts(ctx);
  if (!r.ok) return [];
  return r.data
    .map((c) => ({ phone: c.phone, name: c.name }))
    .slice(0, 500)
    .sort((a, b) => (a.name ?? a.phone).localeCompare(b.name ?? b.phone, "he"));
}

/** An existing WhatsApp chat on the connected account. */
export interface WaRemoteChat { phone: string; name: string | null; lastMessage: string | null; at: string | null }

/** The connected account's EXISTING chats (personal only, newest first). */
export async function waRemoteChatsAction(): Promise<WaRemoteChat[]> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return [];
  const r = await personalFetchChats(ctx);
  if (!r.ok) return [];
  return r.data.map((c) => ({ phone: c.phone, name: c.name, lastMessage: c.lastMessage, at: c.at }));
}

/** Load a remote WhatsApp chat's messages by phone (oldest first). */
export async function waRemoteThreadAction(phone: string): Promise<{ id: string; direction: string; body: string; at: string | null }[]> {
  const ctx = await resolveSessionCtx();
  if (!ctx || !phone) return [];
  const r = await personalFetchChatMessages(ctx, phone);
  if (!r.ok) return [];
  return r.data.map((m) => ({ id: m.id, direction: m.direction, body: m.body, at: m.at }));
}
