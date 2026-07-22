// ============================================================================
// 📡 ZONO OS 2.0 — STAGE 6 · Batch 6.2 · COMMUNICATION OS — provider (server).
//
// THE Communication Provider. Every future surface that reads conversations
// consumes THIS — one runtime over all channels. It fans out to the channel
// adapters, routes by canonical id, and exposes the capability set. It adds NO
// business logic, NO AI, NO scoring, NO priorities: it composes adapter output.
//
// Isolation is inherited + applied once here:
//   · Cross-org — RLS inside the frozen source services (never re-queried).
//   · Broker vs manager — resolved once from the caller's own identity
//     (has_min_role) and passed as scope to every adapter; never widened.
// Request-level dedup uses React cache() (existing primitive) — no new cache.
// ============================================================================
import "server-only";
import { cache } from "react";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { whatsappAdapter } from "./adapters/whatsapp";
import { gmailAdapter } from "./adapters/gmail";
import { calendarAdapter } from "./adapters/calendar";
import { resolvePeople } from "./compose";
import {
  parseCanonicalId, type Attachment, type CanonicalPerson, type ChannelAdapter,
  type CommunicationScope, type CommunicationState, type CommunicationSummary,
  type Conversation, type Message, type Participant,
} from "./types";

/** The registered channel adapters — one per channel, no duplicates. */
const ADAPTERS: ChannelAdapter[] = [whatsappAdapter, gmailAdapter, calendarAdapter];
const ADAPTER_BY_CHANNEL = new Map(ADAPTERS.map((a) => [a.channel, a]));

/** Resolve the caller's isolation scope ONCE per request. Fails closed to a
 *  non-manager with no broker id (sees nothing) on any error. */
export const resolveScope = cache(async (): Promise<CommunicationScope> => {
  try {
    const s = await getSessionContext();
    const brokerId = s.user?.id ?? null;
    const db = await createClient();
    const { data } = await db.rpc("has_min_role", { p_min: "manager" });
    return { brokerId, isManager: data === true };
  } catch {
    return { brokerId: null, isManager: false };
  }
});

const adapterFor = (id: string): { adapter: ChannelAdapter; sourceId: string } | null => {
  const parsed = parseCanonicalId(id);
  if (!parsed) return null;
  const adapter = ADAPTER_BY_CHANNEL.get(parsed.channel);
  return adapter ? { adapter, sourceId: parsed.sourceId } : null;
};

/** List every conversation across all channels, newest activity first. Each
 *  adapter degrades to [] independently — one channel failing never fails the
 *  list. Request-memoized. */
export const listConversations = cache(async (): Promise<Conversation[]> => {
  const scope = await resolveScope();
  const per = await Promise.all(ADAPTERS.map((a) => a.listConversations(scope).catch(() => [] as Conversation[])));
  return per.flat().sort((a, b) => {
    const av = a.lastActivityAt ?? "", bv = b.lastActivityAt ?? "";
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
});

/** Load one conversation by canonical id, routed to its channel adapter. */
export async function loadConversation(id: string): Promise<Conversation | null> {
  const r = adapterFor(id);
  if (!r) return null;
  const scope = await resolveScope();
  return r.adapter.loadConversation(r.sourceId, scope).catch(() => null);
}

/** Load one conversation's messages, routed to its channel adapter. */
export async function loadMessages(id: string): Promise<Message[]> {
  const r = adapterFor(id);
  if (!r) return [];
  const scope = await resolveScope();
  return r.adapter.loadMessages(r.sourceId, scope).catch(() => []);
}

export async function participants(id: string): Promise<Participant[]> {
  return (await loadConversation(id))?.participants ?? [];
}

export async function lastActivity(id: string): Promise<string | null> {
  return (await loadConversation(id))?.lastActivityAt ?? null;
}

export async function unreadCount(id: string): Promise<number> {
  return (await loadConversation(id))?.unreadCount ?? 0;
}

export async function attachments(id: string): Promise<Attachment[]> {
  return (await loadMessages(id)).flatMap((m) => m.attachments);
}

export async function conversationState(id: string): Promise<CommunicationState> {
  return (await loadConversation(id))?.state ?? { flags: [] };
}

export async function summary(id: string): Promise<CommunicationSummary | null> {
  return (await loadConversation(id))?.summary ?? null;
}

/** Canonical identity: group conversations across channels into one person per
 *  shared CRM reference. One customer · multiple channels · one history. */
export async function listPeople(): Promise<CanonicalPerson[]> {
  return resolvePeople(await listConversations());
}
