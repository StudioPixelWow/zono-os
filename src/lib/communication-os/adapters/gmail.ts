// ============================================================================
// 📡 Communication OS — Gmail adapter. Batch 6.2 (stub) → Batch 6.5 (LIVE).
//
// Batch 6.5 replaces the contract stub with a live Gmail source WITHOUT changing
// the canonical model, the ChannelAdapter contract, or the provider registration
// (those stay frozen). This adapter still ONLY maps facts: it pulls the connected
// user's Gmail threads through src/lib/google/gmail and maps them into the SAME
// Conversation/Message model via the existing mapGmailConversation mapper — no
// new email model is introduced. When no Google account is connected it degrades
// to the identical honest-empty behavior as before (never fabricated).
// ============================================================================
import "server-only";
import type { ChannelAdapter, Attachment, Conversation, Message } from "../types";
import { canonicalId } from "../types";
import { mapGmailConversation } from "./mappers";
import { listThreadLikesForCurrentUser, loadThreadForCurrentUser } from "@/lib/google/gmail";
import type { GmailMessage } from "@/lib/google/types";

function mapMessage(m: GmailMessage): Message {
  const attachments: Attachment[] = m.attachments.map((a) => ({
    id: a.id, kind: "document", name: a.filename, mimeType: a.mimeType, url: null, sizeBytes: a.sizeBytes,
  }));
  return {
    id: canonicalId("gmail", m.id),
    conversationId: canonicalId("gmail", m.threadId),
    channel: "gmail",
    direction: m.outbound ? "outbound" : "inbound",
    authorId: `gmail:person:${m.threadId}`,
    sentAt: m.sentAt,
    preview: m.snippet ?? m.subject ?? "",
    attachments,
    read: !m.unread,
  };
}

export const gmailAdapter: ChannelAdapter = {
  channel: "gmail",
  async listConversations() {
    const threads = await listThreadLikesForCurrentUser(25);
    return threads.map(mapGmailConversation);
  },
  async loadConversation(sourceId): Promise<Conversation | null> {
    const threads = await listThreadLikesForCurrentUser(50);
    const t = threads.find((x) => x.id === sourceId);
    return t ? mapGmailConversation(t) : null;
  },
  async loadMessages(sourceId): Promise<Message[]> {
    const msgs = await loadThreadForCurrentUser(sourceId);
    return msgs.map(mapMessage);
  },
};
