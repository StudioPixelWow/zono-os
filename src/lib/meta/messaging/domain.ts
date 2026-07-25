// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING DOMAIN (PURE). Phase 6.
// ----------------------------------------------------------------------------
// Canonical, provider-neutral messaging types for Facebook Messenger + Instagram
// Direct on CONNECTED assets. Message BODIES are sensitive (encrypted at rest — a
// body never appears in a domain value here except as text the caller already
// holds to encrypt). NO token, raw Graph payload, webhook signature, or encryption
// key is ever represented. Outbound is APPROVAL-GATED and window/policy-tag bound —
// nothing here auto-sends. Supported Meta policy tags ONLY.
// ============================================================================
import type { MetaPlatform } from "../types";

export type MessageDirection = "inbound" | "outbound";
export type DeliveryState = "pending" | "sent" | "delivered" | "read" | "failed";
export type ConversationStatus = "open" | "assigned" | "snoozed" | "resolved";
export type SendApprovalState = "pending" | "approved" | "rejected";
export type SendStatus = "pending" | "ready" | "sent" | "failed" | "manual_review";
export type WindowState = "within_24h" | "human_agent" | "tag_permitted" | "expired" | "unknown";

// SUPPORTED Meta messaging policy tags ONLY (no unsupported tag is ever accepted).
export type MessagingPolicyTag = "HUMAN_AGENT" | "CONFIRMED_EVENT_UPDATE" | "POST_PURCHASE_UPDATE" | "ACCOUNT_UPDATE";
export const SUPPORTED_POLICY_TAGS: readonly MessagingPolicyTag[] = ["HUMAN_AGENT", "CONFIRMED_EVENT_UPDATE", "POST_PURCHASE_UPDATE", "ACCOUNT_UPDATE"];

export interface SafeAttachment { kind: string; hasMedia: boolean }

/** A canonical DM conversation (thread) — bound to a connected asset. */
export interface ConversationRecord {
  platform: MetaPlatform;
  externalThreadId: string;
  participantExternalId: string | null;
  participantDisplaySafe: string | null;
  lastInboundAt: string | null;      // drives the 24h window
  lastMessageAt: string | null;
}

/** A canonical message. `body` is plaintext IN MEMORY ONLY — the store encrypts it. */
export interface MessageRecord {
  externalMessageId: string;
  direction: MessageDirection;
  senderExternalId: string | null;
  body: string;
  attachmentsSafe: readonly SafeAttachment[];
  providerCreatedAt: string | null;
}

export interface ConversationFilter { platform?: MetaPlatform; status?: ConversationStatus; assigneeUserId?: string | null; unreadOnly?: boolean; query?: string }
export type ConversationSort = "recent" | "oldest";
export interface ConversationPage { limit: number; offset: number }

export const MESSAGE_BODY_MAX = 4000;
export const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;         // 24h standard messaging window
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;  // 7d Human Agent window

export const isPolicyTag = (v: unknown): v is MessagingPolicyTag => typeof v === "string" && (SUPPORTED_POLICY_TAGS as readonly string[]).includes(v);
export const isConversationStatus = (v: unknown): v is ConversationStatus => v === "open" || v === "assigned" || v === "snoozed" || v === "resolved";
