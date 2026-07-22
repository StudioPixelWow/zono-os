// ============================================================================
// 📡 Communication OS — WhatsApp adapter. Batch 6.2.
//
// Maps the FROZEN WhatsApp read models (getUnifiedInbox / getConversationDetail)
// into the canonical Conversation model. NO SQL of its own — it consumes the
// service, inheriting org RLS; broker isolation is applied from the scope
// (non-managers see only conversations assigned to them). It knows NOTHING about
// CRM or Journey — it only copies the opaque reference ids WaConv already holds.
// ============================================================================
import "server-only";
import { getUnifiedInbox, getConversationDetail } from "@/lib/whatsapp/inbox-service";
import type { ChannelAdapter, CommunicationScope, Conversation, Message } from "../types";
import { mapWhatsappConversation, mapWhatsappMessages, enrichSummary } from "./mappers";

const visibleTo = (assignedAgentId: string | null, scope: CommunicationScope): boolean =>
  scope.isManager || (scope.brokerId != null && assignedAgentId === scope.brokerId);

export const whatsappAdapter: ChannelAdapter = {
  channel: "whatsapp",

  async listConversations(scope) {
    const inbox = await getUnifiedInbox().catch(() => null);
    if (!inbox) return [];
    const convs = inbox.groups.flatMap((g) => g.conversations)
      .filter((c) => visibleTo(c.assignedAgentId, scope));
    return convs.map(mapWhatsappConversation);
  },

  async loadConversation(sourceId, scope): Promise<Conversation | null> {
    const detail = await getConversationDetail(sourceId).catch(() => null);
    if (!detail?.conversation) return null;
    if (!visibleTo(detail.conversation.assignedAgentId, scope)) return null;
    const conv = mapWhatsappConversation(detail.conversation);
    const messages = mapWhatsappMessages(detail.timeline, sourceId);
    // Enrich last-reply/waiting/latest from the loaded messages, keeping the
    // authoritative conversation-level unread count.
    return { ...conv, summary: enrichSummary(messages, conv.participants.length, conv.unreadCount) };
  },

  async loadMessages(sourceId, scope): Promise<Message[]> {
    const detail = await getConversationDetail(sourceId).catch(() => null);
    if (!detail?.conversation || !visibleTo(detail.conversation.assignedAgentId, scope)) return [];
    return mapWhatsappMessages(detail.timeline, sourceId);
  },
};
