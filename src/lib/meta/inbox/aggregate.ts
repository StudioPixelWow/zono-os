// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX AGGREGATION (PURE). Phase 3.
// ----------------------------------------------------------------------------
// Folds an already-ingested comment thread (+ its root comment) into a canonical
// unified-inbox conversation record. This is a LOCAL projection over Phase-1
// canonical data — it never calls Graph and never copies more than a safe preview
// snippet of content. Facebook + Instagram threads project into the SAME canonical
// shape (aggregation across platforms). Deterministic + pure.
// ============================================================================
import type { MetaPlatform } from "../types";
import type { ConversationRecord } from "./domain";

export interface ThreadInput {
  rootExternalId: string;
  platform: MetaPlatform;
  providerObjectId: string | null;
  replyCount: number;
  lastActivityAt: string | null;
  rootAuthorExternalId: string | null;
  rootAuthorDisplay: string | null;
  rootMessage: string;
}

const PREVIEW_MAX = 160;
const preview = (s: string) => (s.length > PREVIEW_MAX ? s.slice(0, PREVIEW_MAX - 1).trimEnd() + "…" : s).replace(/\s+/g, " ").trim();

/** Project a comment thread into a canonical inbox conversation record. */
export function aggregateThread(t: ThreadInput): ConversationRecord {
  return {
    sourceKind: "comment_thread",
    sourceRef: t.rootExternalId,
    platform: t.platform,
    providerObjectId: t.providerObjectId,
    participantExternalId: t.rootAuthorExternalId,
    participantDisplay: t.rootAuthorDisplay,
    subjectPreview: preview(t.rootMessage || ""),
    replyCount: Math.max(0, t.replyCount),
    lastActivityAt: t.lastActivityAt,
  };
}

/** Whether a projected record differs from the stored one (drives upsert vs skip). */
export function conversationChanged(prev: Pick<ConversationRecord, "replyCount" | "lastActivityAt" | "subjectPreview"> | null, next: ConversationRecord): boolean {
  if (!prev) return true;
  return prev.replyCount !== next.replyCount || prev.lastActivityAt !== next.lastActivityAt || prev.subjectPreview !== next.subjectPreview;
}
