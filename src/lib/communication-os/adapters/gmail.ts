// ============================================================================
// 📡 Communication OS — Gmail adapter (contract stub). Batch 6.2.
//
// No live Gmail/email source is wired in the platform yet (the connector
// catalog lists Google Workspace but no OAuth ingest exists). This adapter
// establishes the canonical mapping CONTRACT so that the moment a live source
// connects, Gmail threads map into the same Conversation model with no runtime
// change. Until then it honestly returns empty — never fabricated conversations.
//
// The pure mapper (mapGmailConversation) is defined in ./mappers and proven in
// QA, so "every channel maps into the canonical model" already holds for Gmail.
// ============================================================================
import "server-only";
import type { ChannelAdapter } from "../types";

export const gmailAdapter: ChannelAdapter = {
  channel: "gmail",
  async listConversations() { return []; },      // no live source → honest empty
  async loadConversation() { return null; },
  async loadMessages() { return []; },
};
