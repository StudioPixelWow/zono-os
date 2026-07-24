// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COMMENT PROVIDER CONTRACTS. Phase 1.
// ----------------------------------------------------------------------------
// The canonical request/result the engagement engine hands to the sealed Graph
// comments gateway (mirrors the Phase-3A publish + Phase-3C inspect seams). Reads
// are bounded + cursor-paged; a moderation WRITE (reply/hide/unhide/delete) is a
// single call that is NEVER auto-retried, and a post-transmission timeout is
// reported `ambiguous` (resolved later by moderation reconciliation, never blindly
// re-sent). The Page/IG token is used inside Graph only; NO raw Graph payload,
// token, or signed URL escapes these canonical shapes.
// ============================================================================
import type { MetaPlatform } from "../types";

export interface ProviderComment {
  externalId: string;
  parentExternalId: string | null;
  message: string;
  authorExternalId: string | null;
  authorDisplay: string | null;
  createdTime: string | null;
  updatedTime: string | null;
  likeCount: number;
  replyCount: number;
  isHidden: boolean;
  isFromPage: boolean;
  attachmentsSafe: ReadonlyArray<{ kind: string }>;
}

export interface CommentFetchRequest {
  platform: MetaPlatform;
  assetExternalId: string;
  tokenPlain: string;
  objectExternalId: string; // the published post / media id
  cursor: string | null;
  limit: number;
  correlationId: string;
  timeoutMs: number;
}

export interface ProviderCommentError { kind: string; safeMessage: string; providerCodeCategory: string | null; retryClass: string }

export interface CommentFetchResult {
  ok: boolean;
  comments: readonly ProviderComment[];
  nextCursor: string | null;
  ambiguous: boolean;
  error: ProviderCommentError | null;
  warnings: readonly string[];
}

export type ModerationKind = "reply" | "hide" | "unhide" | "delete";

export interface ModerationRequest {
  platform: MetaPlatform;
  assetExternalId: string;
  tokenPlain: string;
  actionKind: ModerationKind;
  targetCommentExternalId: string;
  replyText: string | null;
  idempotencyKey: string;
  correlationId: string;
  timeoutMs: number;
}

export interface ModerationResult {
  ok: boolean;
  /** The created reply's external id (reply only); null otherwise. */
  providerResultId: string | null;
  ambiguous: boolean;
  error: ProviderCommentError | null;
  retryClass: string;
}

/** The sealed comments gateway the engagement engine depends on
 *  (implemented in provider/graph/comments.ts). */
export interface CommentsGateway {
  fetchComments(req: CommentFetchRequest): Promise<CommentFetchResult>;
  moderate(req: ModerationRequest): Promise<ModerationResult>;
}
