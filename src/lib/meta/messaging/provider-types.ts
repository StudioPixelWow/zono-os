// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING PROVIDER CONTRACTS (canonical). Phase 6.
// ----------------------------------------------------------------------------
// The secret-free contracts the sealed messaging gateway speaks. Graph endpoints,
// raw fields, paging cursors and version literals live ONLY in provider/graph/
// messaging.ts. The gateway exposes bounded READS (conversations + messages) and a
// SINGLE approval-gated SEND — no bulk send, no auto-send. A send is called by the
// engine ONLY after explicit approval + window + policy-tag + capability checks; an
// ambiguous outcome is surfaced (→ manual review), never silently retried.
// ============================================================================
import type { CanonicalConversation, CanonicalMessage } from "./normalize";
import type { MetaPlatform } from "../types";

export interface MessagingReadRequest {
  platform: MetaPlatform; assetExternalId: string; tokenPlain: string; cursorRef: string | null; pageLimit: number; correlationId: string;
  threadExternalId?: string | null;   // when reading a single thread's messages
}
export interface MessagingError { kind: string; safeMessage: string; providerCodeCategory: string | null; retryClass: string; retryAfterMs: number | null }

export interface ConversationsResult { ok: boolean; conversations: readonly CanonicalConversation[]; nextCursorRef: string | null; ambiguous: boolean; error: MessagingError | null }
export interface MessagesResult { ok: boolean; conversation: CanonicalConversation | null; messages: readonly CanonicalMessage[]; nextCursorRef: string | null; ambiguous: boolean; error: MessagingError | null }

export interface SendRequest {
  platform: MetaPlatform; assetExternalId: string; tokenPlain: string; recipientExternalId: string;
  body: string;                 // plaintext held only for the single send call (never logged/stored plaintext)
  policyTag: string | null;     // a SUPPORTED tag, when required by the window
  correlationId: string;
}
export interface SendResult { ok: boolean; providerMessageId: string | null; ambiguous: boolean; error: MessagingError | null }

export interface MessagingGateway {
  fetchConversations(req: MessagingReadRequest): Promise<ConversationsResult>;
  fetchMessages(req: MessagingReadRequest): Promise<MessagesResult>;
  /** The ONLY write — a single approval-gated outbound send. NEVER called automatically. */
  sendMessage(req: SendRequest): Promise<SendResult>;
}
