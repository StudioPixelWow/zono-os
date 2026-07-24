// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COMMENT THREADING (PURE). Phase 1.
// ----------------------------------------------------------------------------
// Rolls a flat set of canonical comments into per-root thread summaries: reply
// count, last activity, whether the connected Page has replied, and whether the
// thread still has an unaddressed public comment (a moderation-priority signal).
// Deleted comments are excluded from "unaddressed". Pure + deterministic.
// ============================================================================
import type { CommentRecord, ThreadRollup } from "./domain";

/** Build thread rollups grouped by root comment. Deterministic ordering. */
export function rollupThreads(comments: readonly CommentRecord[]): ThreadRollup[] {
  const byRoot = new Map<string, CommentRecord[]>();
  for (const c of comments) {
    const arr = byRoot.get(c.rootExternalId) ?? [];
    arr.push(c);
    byRoot.set(c.rootExternalId, arr);
  }
  const out: ThreadRollup[] = [];
  for (const [root, group] of byRoot) {
    const live = group.filter((c) => c.status !== "deleted");
    const replies = live.filter((c) => c.externalId !== root);
    const pageReplied = replies.some((c) => c.isFromPage);
    // Unaddressed = a live public (non-page) comment/reply with no page reply after it.
    const hasPublic = live.some((c) => !c.isFromPage && c.status !== "hidden");
    const lastActivityAt = live.map((c) => c.providerCreatedAt).filter((t): t is string => !!t).sort().at(-1) ?? null;
    out.push({ rootExternalId: root, replyCount: replies.length, lastActivityAt, pageReplied, hasUnaddressed: hasPublic && !pageReplied });
  }
  return out.sort((a, b) => (a.rootExternalId < b.rootExternalId ? -1 : 1));
}
