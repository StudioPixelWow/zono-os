// ============================================================================
// 🤖 ZONO — Copilot canonical NORMALIZER (pure, transport-agnostic).
// ----------------------------------------------------------------------------
// Reduces a canonical Conversation + Message[] to the channel-free analysis view
// the Copilot reasons over. It NEVER reads `channel` (or any transport detail),
// so two conversations with identical content but different transports produce
// an identical transcript/waiting/counts. Pure — no I/O, no server-only, so it
// is unit-testable and reused by both the live read and the QA fixtures.
// ============================================================================
import type { Conversation, Message } from "@/lib/communication-os/types";
import type { AnalysisMessage, CopilotConversationView } from "./types";

/** Canonical Conversation + Message[] → channel-free analysis view. */
export function toAnalysisView(conversation: Conversation, messages: Message[]): CopilotConversationView {
  const ordered = [...messages].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const transcript: AnalysisMessage[] = ordered.map((m, i) => ({
    seq: i,
    messageRef: m.id,
    direction: m.direction,
    sentAt: m.sentAt,
    text: m.preview,
  }));
  const agentId = conversation.participants.find((p) => p.kind === "broker")?.id ?? null;
  const clientName = conversation.participants.find((p) => p.kind === "person")?.displayName ?? null;
  return {
    conversationRef: conversation.id,
    agentId,
    clientName,
    waiting: conversation.summary.waiting,
    unread: conversation.unreadCount,
    messageCount: transcript.length,
    lastActivityAt: conversation.lastActivityAt,
    transcript,
    crmLinks: {
      lead: conversation.crmLinks.lead,
      buyer: conversation.crmLinks.buyer,
      seller: conversation.crmLinks.seller,
      journey: conversation.crmLinks.journey,
      deal: conversation.crmLinks.deal,
      property: conversation.crmLinks.property,
    },
  };
}
