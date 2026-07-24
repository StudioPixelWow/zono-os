// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COMMENT NORMALIZATION + DEDUP (PURE). Phase 1.
// ----------------------------------------------------------------------------
// Maps a provider comment (already secret-free, mapped inside Graph) to the
// canonical persistence record: resolves the thread root, derives status, and
// computes a deterministic content fingerprint so re-syncs update in place and an
// unchanged comment is a no-op. The natural dedup key is (org, platform,
// external_comment_id); the fingerprint additionally detects edits/hides/likes.
// Pure: (provider comment) → canonical record; no clock, no IO.
// ============================================================================
import { createHash } from "node:crypto";
import type { MetaPlatform } from "../types";
import type { ProviderComment } from "./provider-types";
import type { CommentRecord, CommentStatus } from "./domain";

/** Deterministic fingerprint over the mutable fields of a comment. */
export function commentFingerprint(c: Pick<ProviderComment, "message" | "isHidden" | "likeCount" | "replyCount">): string {
  return createHash("sha256").update(JSON.stringify({ m: c.message, h: c.isHidden, l: c.likeCount, r: c.replyCount })).digest("hex").slice(0, 32);
}

/** Normalize a provider comment to a canonical record. `pageActorIds` marks
 *  which author ids are the connected Page/IG account (→ isFromPage). */
export function normalizeComment(pc: ProviderComment, platform: MetaPlatform, pageActorIds: ReadonlySet<string> = new Set()): CommentRecord {
  const status: CommentStatus = pc.isHidden ? "hidden" : "visible";
  const isFromPage = pc.isFromPage || (!!pc.authorExternalId && pageActorIds.has(pc.authorExternalId));
  return {
    externalId: pc.externalId,
    parentExternalId: pc.parentExternalId,
    rootExternalId: pc.parentExternalId ?? pc.externalId,
    platform,
    authorExternalId: pc.authorExternalId,
    authorDisplay: pc.authorDisplay,
    message: pc.message,
    likeCount: pc.likeCount,
    replyCount: pc.replyCount,
    status,
    isFromPage,
    providerCreatedAt: pc.createdTime,
    providerUpdatedAt: pc.updatedTime,
    attachmentsSafe: pc.attachmentsSafe.map((a) => ({ kind: a.kind })),
    contentFingerprint: commentFingerprint(pc),
  };
}

/** Whether a re-synced comment materially changed (edit/hide/like/reply-count). */
export function commentChanged(existingFingerprint: string | null, next: CommentRecord): boolean {
  return existingFingerprint !== next.contentFingerprint;
}
