// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COMMENT DOMAIN TYPES (PURE). Phase 1.
// ----------------------------------------------------------------------------
// Canonical, secret-free persistence shapes for ingested comments, thread
// rollups, and outbound moderation actions. No token, raw Graph payload, or
// signed URL ever appears here. These are the currency the pure engine + store
// speak; the Phase-0 `engagement/types.ts` (MetaComment/MetaEngagementEvent) is
// left untouched (it is referenced by the provider interface).
// ============================================================================
import type { MetaPlatform } from "../types";

export type CommentStatus = "visible" | "hidden" | "deleted" | "unknown" | "pending";

export interface CommentRecord {
  externalId: string;
  parentExternalId: string | null;
  rootExternalId: string;
  platform: MetaPlatform;
  authorExternalId: string | null;
  authorDisplay: string | null;
  message: string;
  likeCount: number;
  replyCount: number;
  status: CommentStatus;
  isFromPage: boolean;
  providerCreatedAt: string | null;
  providerUpdatedAt: string | null;
  attachmentsSafe: ReadonlyArray<{ kind: string }>;
  contentFingerprint: string;
}

export interface ThreadRollup {
  rootExternalId: string;
  replyCount: number;
  lastActivityAt: string | null;
  pageReplied: boolean;
  hasUnaddressed: boolean;
}

export type ModerationKind = "reply" | "hide" | "unhide" | "delete";
export type ModerationApprovalState = "draft" | "pending" | "approved" | "rejected";
export type ModerationStatus = "pending" | "ready" | "executing" | "provider_processing" | "succeeded" | "failed" | "manual_review_required" | "cancelled" | "blocked";
