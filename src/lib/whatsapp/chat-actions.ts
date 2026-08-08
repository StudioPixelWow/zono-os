// ============================================================================
// 💬 ZONO WhatsApp — Conversation Center SERVER ACTIONS (personal transport).
// ----------------------------------------------------------------------------
// A thin, defensive READ + REPLY surface over the EXISTING whatsapp_* tables for
// the in-app conversation center. Reads run under RLS via the cookie client;
// sends delegate to the canonical personalSendAction (human-in-the-loop, kill
// switch, connected session). No Evolution detail here — only the neutral
// personal surface. Never throws (degrades to empty).
// ============================================================================
"use server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { personalSendAction } from "./provider/personal/actions";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const bool = (v: unknown): boolean => v === true;

async function orgId(): Promise<string | null> {
  try {
    const sc = await getSessionContext();
    return sc.profile?.org_id ?? null;
  } catch {
    return null;
  }
}

export interface WaChatConv {
  id: string;
  name: string;
  lastMessage: string | null;
  lastAt: string | null;
  unread: boolean;
  needsResponse: boolean;
  state: string | null;
}

/** All conversations for the org, newest first (RLS cookie client). Never throws. */
export async function waChatListAction(): Promise<WaChatConv[]> {
  const org = await orgId();
  if (!org) return [];
  try {
    const db = await createClient();
    const { data } = await db
      .from("whatsapp_conversations" as never)
      .select("id,contact_name,last_message,last_message_at,unread,needs_response,state" as never)
      .eq("organization_id" as never, org as never)
      .order("last_message_at" as never, { ascending: false })
      .limit(200);
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: s(r.id) ?? "",
      name: s(r.contact_name) ?? "ללא שם",
      lastMessage: s(r.last_message),
      lastAt: s(r.last_message_at),
      unread: bool(r.unread),
      needsResponse: bool(r.needs_response),
      state: s(r.state),
    }));
  } catch {
    return [];
  }
}

/** Resolve a conversation's plaintext phone from the most recent message that
 *  carries metadata->>'from'. Returns null when none is available. */
async function resolvePhone(
  db: Awaited<ReturnType<typeof createClient>>,
  org: string,
  conversationId: string,
): Promise<string | null> {
  try {
    const { data } = await db
      .from("whatsapp_messages" as never)
      .select("metadata,created_at" as never)
      .eq("organization_id" as never, org as never)
      .eq("conversation_id" as never, conversationId as never)
      .order("created_at" as never, { ascending: false })
      .limit(100);
    for (const r of (data ?? []) as unknown as Row[]) {
      const meta = r.metadata as Record<string, unknown> | null;
      const from = meta ? s(meta.from) : null;
      if (from) return from;
    }
  } catch {
    /* table absent */
  }
  return null;
}

export interface WaChatThread {
  messages: { id: string; direction: string; body: string; at: string | null }[];
  phone: string | null;
  name: string | null;
}

/** One conversation's messages (oldest first) + resolved phone + contact name. Never throws. */
export async function waChatThreadAction(conversationId: string): Promise<WaChatThread> {
  const empty: WaChatThread = { messages: [], phone: null, name: null };
  const org = await orgId();
  if (!org || !conversationId) return empty;
  try {
    const db = await createClient();
    const [msgRes, convRes, phone] = await Promise.all([
      db
        .from("whatsapp_messages" as never)
        .select("id,direction,body,created_at" as never)
        .eq("organization_id" as never, org as never)
        .eq("conversation_id" as never, conversationId as never)
        .order("created_at" as never, { ascending: true })
        .limit(100),
      db
        .from("whatsapp_conversations" as never)
        .select("contact_name" as never)
        .eq("organization_id" as never, org as never)
        .eq("id" as never, conversationId as never)
        .limit(1)
        .maybeSingle(),
      resolvePhone(db, org, conversationId),
    ]);
    const messages = ((msgRes.data ?? []) as unknown as Row[]).map((r) => ({
      id: s(r.id) ?? "",
      direction: s(r.direction) === "inbound" ? "inbound" : "outbound",
      body: s(r.body) ?? "",
      at: s(r.created_at),
    }));
    const name = convRes.data ? s((convRes.data as Row).contact_name) : null;
    return { messages, phone, name };
  } catch {
    return empty;
  }
}

/** Send a reply to an existing conversation. Resolves the phone from the thread. */
export async function waChatSendReplyAction(
  conversationId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = (text ?? "").trim();
  if (!body) return { ok: false, error: "הודעה ריקה" };
  const org = await orgId();
  if (!org || !conversationId) return { ok: false, error: "אין הרשאה." };
  const db = await createClient();
  const phone = await resolvePhone(db, org, conversationId);
  if (!phone) return { ok: false, error: "לא נמצא מספר טלפון לשיחה הזו" };
  const r = await personalSendAction(phone, body, true);
  return { ok: r.ok, error: r.error };
}

/** Start a brand-new conversation by sending the first message to a phone. */
export async function waChatStartAction(
  phone: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const p = (phone ?? "").trim();
  const body = (text ?? "").trim();
  const digits = p.replace(/\D/g, "");
  if (digits.length < 9) return { ok: false, error: "מספר טלפון לא תקין" };
  if (!body) return { ok: false, error: "הודעה ריקה" };
  const r = await personalSendAction(p, body, true);
  return { ok: r.ok, error: r.error };
}
