// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · UNIFIED INBOX DOMAIN TYPES (PURE). Phase 3.
// ----------------------------------------------------------------------------
// The CANONICAL, Meta-scoped conversation model for the unified inbox. It is
// source-agnostic (Phase 3 sources = comment threads; later phases may add
// messages/mentions) and REFERENCES the already-ingested canonical comment data —
// it never stores a Graph model, token, or raw payload, and it does NOT duplicate
// the Communication OS conversation model (this is Meta-workspace-scoped). These
// are the shapes the pure engine + store speak.
// ============================================================================
import type { MetaPlatform } from "../types";

// Phase 3 = comment_thread. Phase 5 additively projects listening mentions into
// the SAME inbox as source_kind = "mention" (no second inbox model).
export type InboxSourceKind = "comment_thread" | "mention";
export type InboxStatus = "open" | "snoozed" | "archived" | "resolved";

export interface ConversationRecord {
  sourceKind: InboxSourceKind;
  sourceRef: string;                 // the thread key (root external comment id)
  platform: MetaPlatform;
  providerObjectId: string | null;   // the canonical published object (post)
  participantExternalId: string | null;
  participantDisplay: string | null;
  subjectPreview: string;            // safe snippet, never the full raw payload
  replyCount: number;
  lastActivityAt: string | null;
}

export interface ConversationState {
  status: InboxStatus;
  snoozedUntil: string | null;
  lastReadAt: string | null;
  assigneeUserId: string | null;
  priority: number;
}

/** Filters the inbox list supports (all optional; combined with AND). */
export interface InboxFilter {
  status?: InboxStatus;
  platform?: MetaPlatform;
  assigneeUserId?: string | null;   // null = unassigned
  unreadOnly?: boolean;
  labelId?: string;
  query?: string;                   // text over participant + subject preview
}

export type InboxSort = "recent" | "oldest" | "priority";
export interface InboxPage { limit: number; offset: number }
