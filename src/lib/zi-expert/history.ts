// ============================================================================
// ZI Expert™ — conversation history repository (Phase 22, SERVER-ONLY).
// Persists support conversations + messages. Org-scoped and per-user via RLS
// (organization_id = current_org_id() AND user_id = auth.uid()). Soft delete.
// ZI is read-only toward business data — this module only writes the chat log.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { ZiConversation, ZiMessage, ZiPagination, ZiRole, ZiSource } from "./types";

interface Identity { db: Awaited<ReturnType<typeof createClient>>; orgId: string; userId: string }

/** Resolve the authenticated identity (throws if not ready). */
async function identity(): Promise<Identity> {
  const { user, profile, state } = await getSessionContext();
  if (state !== "ready" || !user || !profile?.org_id) throw new Error("unauthorized");
  const db = await createClient();
  return { db, orgId: profile.org_id, userId: user.id };
}

type ConvRow = {
  id: string; title: string; route: string | null; module_id: string | null;
  pinned: boolean; archived: boolean; message_count: number;
  last_message_at: string | null; created_at: string; updated_at: string;
};
type MsgRow = {
  id: string; conversation_id: string; role: ZiRole; content: string;
  source: ZiSource | null; route: string | null; module_id: string | null;
  rating: "up" | "down" | null; created_at: string;
};

function toConversation(r: ConvRow): ZiConversation {
  return {
    id: r.id, title: r.title, route: r.route, moduleId: r.module_id,
    pinned: r.pinned, archived: r.archived, messageCount: r.message_count,
    lastMessageAt: r.last_message_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function toMessage(r: MsgRow): ZiMessage {
  return {
    id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content,
    source: r.source, route: r.route, moduleId: r.module_id, rating: r.rating, createdAt: r.created_at,
  };
}

const CONV_COLS = "id,title,route,module_id,pinned,archived,message_count,last_message_at,created_at,updated_at";
const MSG_COLS = "id,conversation_id,role,content,source,route,module_id,rating,created_at";

// ── conversations ────────────────────────────────────────────────────────────
export async function createConversationRow(input: { title: string; route: string | null; moduleId: string | null }): Promise<ZiConversation> {
  const { db, orgId, userId } = await identity();
  const { data, error } = await db
    .from("zi_conversations")
    .insert({ organization_id: orgId, user_id: userId, title: input.title, route: input.route, module_id: input.moduleId })
    .select(CONV_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  return toConversation(data as ConvRow);
}

export async function listConversationRows(includeArchived = false): Promise<ZiConversation[]> {
  const { db } = await identity();
  let q = db.from("zi_conversations").select(CONV_COLS).is("deleted_at", null).order("pinned", { ascending: false }).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as ConvRow[] | null ?? []).map(toConversation);
}

export async function searchConversationRows(query: string): Promise<ZiConversation[]> {
  const { db } = await identity();
  const term = query.replace(/[%_]/g, "").trim();
  if (!term) return listConversationRows(true);
  const { data, error } = await db
    .from("zi_conversations").select(CONV_COLS).is("deleted_at", null)
    .ilike("title", `%${term}%`).order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data as ConvRow[] | null ?? []).map(toConversation);
}

export async function getMessageRows(conversationId: string, page: ZiPagination = { limit: 50, offset: 0 }): Promise<ZiMessage[]> {
  const { db } = await identity();
  const { data, error } = await db
    .from("zi_messages").select(MSG_COLS).eq("conversation_id", conversationId).is("deleted_at", null)
    .order("created_at", { ascending: true })
    .range(page.offset, page.offset + page.limit - 1);
  if (error) throw new Error(error.message);
  return (data as MsgRow[] | null ?? []).map(toMessage);
}

export async function appendMessageRow(input: {
  conversationId: string; role: ZiRole; content: string; source: ZiSource | null; route: string | null; moduleId: string | null;
}): Promise<ZiMessage> {
  const { db, orgId, userId } = await identity();
  const { data, error } = await db
    .from("zi_messages")
    .insert({
      organization_id: orgId, user_id: userId, conversation_id: input.conversationId,
      role: input.role, content: input.content, source: input.source, route: input.route, module_id: input.moduleId,
    })
    .select(MSG_COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "append_failed");
  return toMessage(data as MsgRow);
}

/** Bump the conversation's last_message_at + message_count after a turn. */
export async function touchConversation(conversationId: string, addMessages: number): Promise<void> {
  const { db } = await identity();
  const { data } = await db.from("zi_conversations").select("message_count").eq("id", conversationId).single();
  const next = ((data as { message_count: number } | null)?.message_count ?? 0) + addMessages;
  await db.from("zi_conversations").update({ message_count: next, last_message_at: new Date().toISOString() }).eq("id", conversationId);
}

export async function renameConversationRow(conversationId: string, title: string): Promise<void> {
  const { db } = await identity();
  const { error } = await db.from("zi_conversations").update({ title: title.slice(0, 120) }).eq("id", conversationId);
  if (error) throw new Error(error.message);
}

export async function setPinnedRow(conversationId: string, pinned: boolean): Promise<void> {
  const { db } = await identity();
  const { error } = await db.from("zi_conversations").update({ pinned }).eq("id", conversationId);
  if (error) throw new Error(error.message);
}

export async function setArchivedRow(conversationId: string, archived: boolean): Promise<void> {
  const { db } = await identity();
  const { error } = await db.from("zi_conversations").update({ archived }).eq("id", conversationId);
  if (error) throw new Error(error.message);
}

export async function softDeleteConversationRow(conversationId: string): Promise<void> {
  const { db } = await identity();
  const now = new Date().toISOString();
  const { error } = await db.from("zi_conversations").update({ deleted_at: now }).eq("id", conversationId);
  if (error) throw new Error(error.message);
  await db.from("zi_messages").update({ deleted_at: now }).eq("conversation_id", conversationId);
}

export async function rateMessageRow(messageId: string, rating: "up" | "down" | null): Promise<void> {
  const { db } = await identity();
  const { error } = await db.from("zi_messages").update({ rating }).eq("id", messageId);
  if (error) throw new Error(error.message);
}
