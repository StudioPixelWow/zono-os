// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONTENT contracts. Phase 0.
// ----------------------------------------------------------------------------
// Canonical cross-platform draft model. A draft targets one or more assets, may
// carry per-platform variants, and moves through an approval workflow. The
// Copilot NEVER auto-publishes: every draft is approval-gated by contract.
// ============================================================================
import type { Brand, MetaPlatform } from "../types";
import type { MetaAssetRef } from "../assets/types";

export type MetaContentKind = "post" | "reel" | "story" | "carousel";

export type MetaContentStatus =
  | "draft"
  | "validated"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "scheduled"
  | "publishing"
  | "published"
  | "partially_published"
  | "failed"
  | "cancelled";

export type MetaApprovalState = "not_required" | "pending" | "approved" | "rejected";

export type MetaContentDraftId = Brand<string, "MetaContentDraftId">;

/** One publishing target (a specific asset + the kind of object to create). */
export interface MetaContentTarget {
  asset: MetaAssetRef;
  kind: MetaContentKind;
}

/** A per-platform override of the base content (caption/media selection). */
export interface MetaPlatformVariant {
  platform: MetaPlatform;
  caption: string | null;
  mediaIds: readonly string[];
}

/** The canonical cross-platform draft. No Graph fields, no raw payloads. */
export interface MetaContentDraft {
  id: MetaContentDraftId;
  orgId: string;
  createdBy: string;
  kind: MetaContentKind;
  targets: readonly MetaContentTarget[];
  /** Base caption; platform variants may override. */
  caption: string;
  mediaIds: readonly string[];
  variants: readonly MetaPlatformVariant[];
  status: MetaContentStatus;
  approval: MetaApprovalState;
  /** Optional schedule; null = publish immediately when approved. */
  scheduledAt: string | null;
  updatedAt: string;
}
