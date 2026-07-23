// ============================================================================
// 🤖 ZONO — Copilot canonical READ (server-only, transport-agnostic).
// ----------------------------------------------------------------------------
// The Copilot's ONLY door to conversation data. It reads the canonical
// Communication OS through the workspace provider (already cache()'d + RLS/scope
// resolved) and hands the pure normalizer a Conversation + Message[]. It touches
// NO transport table (no whatsapp_*), imports NO transport module, and performs
// NO SQL — so the Copilot stays transport-agnostic and the Communication OS
// stays the single source of truth (unmodified).
// ============================================================================
import "server-only";
import { loadConversation, loadMessages } from "@/lib/communication-workspace/providers";
import { toAnalysisView } from "./normalize";
import type { CopilotConversationView } from "./types";

/** Load a canonical conversation as the channel-free analysis view, or null. */
export async function loadConversationView(conversationRef: string): Promise<CopilotConversationView | null> {
  const conversation = await loadConversation(conversationRef);
  if (!conversation) return null;
  const messages = await loadMessages(conversationRef);
  return toAnalysisView(conversation, messages);
}
