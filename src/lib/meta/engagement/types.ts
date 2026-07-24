// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · ENGAGEMENT contracts. Phase 0.
// ----------------------------------------------------------------------------
// Comments / reactions / engagement events. These are NOT conversations — they
// live in Meta-owned canonical shapes (not Communication OS). The Copilot's PURE
// analyzers may read comment text later; every suggested reply is approval-only.
// No Graph field or raw payload appears here.
// ============================================================================
import type { MetaPlatform } from "../types";
import type { MetaAssetRef } from "../assets/types";

export type MetaCommentStatus = "open" | "replied" | "hidden" | "deleted" | "assigned";

/** A canonical comment on a published object. */
export interface MetaComment {
  id: string;
  orgId: string;
  platform: MetaPlatform;
  /** The asset (Page/IG) the comment belongs to. */
  asset: MetaAssetRef;
  /** Opaque Meta comment id (immutable) — data, not a Graph path. */
  externalId: string;
  /** The canonical id of the post/object being commented on. */
  postRef: string;
  parentCommentId: string | null;
  /** Opaque author handle — never PII-expanded in Phase 0 contracts. */
  authorExternalId: string;
  authorDisplayName: string | null;
  text: string;
  status: MetaCommentStatus;
  assignedTo: string | null;
  createdAt: string;
}

export type MetaEngagementEventKind = "reaction" | "share" | "save" | "mention" | "metric_delta";

/** A lightweight engagement/metrics event (deduped by external id). */
export interface MetaEngagementEvent {
  id: string;
  orgId: string;
  asset: MetaAssetRef;
  externalId: string;
  kind: MetaEngagementEventKind;
  value: number | null;
  occurredAt: string;
}

/**
 * A proposed reply to a comment. ALWAYS advisory — `requiresApproval` is true by
 * contract; nothing here is ever sent automatically.
 */
export interface MetaReplyProposal {
  commentId: string;
  suggestedText: string;
  requiresApproval: true;
  /** Provenance of the suggestion (deterministic analyzer / enrichment). */
  source: "deterministic" | "enriched";
}
