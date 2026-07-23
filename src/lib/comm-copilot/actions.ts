// ============================================================================
// 🤖 ZONO — Copilot server ACTIONS. Phase 1.
// ----------------------------------------------------------------------------
// Entry points for the three freshness triggers. Each resolves org from the
// session (no client-supplied scope) and delegates to the service. The Copilot
// never sends and never mutates canonical conversations.
// ============================================================================
"use server";
import { generateConversationInsight } from "./service";

/** Manual "refresh" button. */
export async function refreshConversationInsightAction(conversationRef: string) {
  return generateConversationInsight(conversationRef, "manual");
}

/** Fired when a conversation is reopened. */
export async function reopenedConversationInsightAction(conversationRef: string) {
  return generateConversationInsight(conversationRef, "reopened");
}

/** Fired on a new message — hash-gated, so it is a safe no-op when nothing
 *  material changed (no rewrite, no future LLM call). */
export async function newMessageConversationInsightAction(conversationRef: string) {
  return generateConversationInsight(conversationRef, "new_message");
}
