// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COMMENT SAFE READ MODELS. Phase 1.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. Comment author display + message text ARE the
// product and are surfaced; but NEVER a token, app secret, raw Graph body, signed
// URL, lease token, idempotency key, or provider trace. Moderation DTOs expose
// only safe status + error CATEGORY.
// ============================================================================
import type { ModerationActionRow } from "./ports";

export interface CommentDTO {
  id: string; externalId: string; platform: string; parentExternalId: string | null; rootExternalId: string;
  authorDisplay: string | null; message: string; likeCount: number; replyCount: number; status: string; isFromPage: boolean; providerCreatedAt: string | null;
}
export function toCommentDTO(c: { id: string; external_comment_id: string; platform: string; external_parent_comment_id: string | null; root_external_comment_id: string | null; author_display: string | null; message_text: string | null; like_count: number; reply_count: number; status: string; is_from_page: boolean; provider_created_at: string | null }): CommentDTO {
  return { id: c.id, externalId: c.external_comment_id, platform: c.platform, parentExternalId: c.external_parent_comment_id, rootExternalId: c.root_external_comment_id ?? c.external_comment_id, authorDisplay: c.author_display, message: c.message_text ?? "", likeCount: c.like_count, replyCount: c.reply_count, status: c.status, isFromPage: c.is_from_page, providerCreatedAt: c.provider_created_at };
}

export interface ThreadDTO { rootExternalId: string; replyCount: number; lastActivityAt: string | null; pageReplied: boolean; hasUnaddressed: boolean }
export function toThreadDTO(t: { root_external_comment_id: string; reply_count: number; last_activity_at: string | null; page_replied: boolean; has_unaddressed: boolean }): ThreadDTO {
  return { rootExternalId: t.root_external_comment_id, replyCount: t.reply_count, lastActivityAt: t.last_activity_at, pageReplied: t.page_replied, hasUnaddressed: t.has_unaddressed };
}

export interface ModerationActionDTO { id: string; actionKind: string; status: string; approvalState: string; targetCommentId: string; safeErrorKind: string | null; createdAt?: string; executedAt: string | null }
export function toModerationActionDTO(a: ModerationActionRow): ModerationActionDTO {
  return { id: a.id, actionKind: a.actionKind, status: a.status, approvalState: a.approvalState, targetCommentId: a.targetCommentId, safeErrorKind: a.safeErrorKind, executedAt: a.executedAtIso };
}
