// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONTENT DOMAIN TYPES. Phase 2.
// ----------------------------------------------------------------------------
// The provider-neutral in-memory domain shapes the pure content engine operates
// over. NO Graph payload field ever appears here — content is canonical. Targets
// reference canonical Phase-1 asset uuids, never raw Meta external ids.
// ============================================================================
import type { MetaPlatform } from "../types";

export type DraftStatus = "draft" | "in_review" | "changes_requested" | "approved" | "rejected" | "archived";
export type DraftApprovalState = "not_required" | "pending" | "approved" | "rejected" | "changes_requested";

export interface DraftTargetState {
  id: string;
  assetKind: "page" | "instagram";
  /** Canonical Phase-1 asset uuid (never a raw Meta external id). */
  assetId: string;
  platform: MetaPlatform;
  contentKind: string;
  enabled: boolean;
  /** null = inherit the shared default. */
  captionOverride: string | null;
  hashtagsOverride: readonly string[] | null;
  /** Ordered canonical media_asset ids. */
  mediaOrder: readonly string[];
  plannedAt: string | null;
}

export interface DraftState {
  id: string;
  orgId: string;
  internalName: string;
  createdBy: string | null;
  currentVersion: number;
  status: DraftStatus;
  contentClass: string;
  defaultCaption: string;
  defaultHashtags: readonly string[];
  plannedAt: string | null;
  timezone: string | null;
  approvalState: DraftApprovalState;
  contentHash: string | null;
  revision: number;
  archivedAt: string | null;
  targets: readonly DraftTargetState[];
}

/** The resolved content for a single target (shared + overrides applied). */
export interface EffectiveContent {
  platform: MetaPlatform;
  contentKind: string;
  caption: string;
  hashtags: readonly string[];
  mediaOrder: readonly string[];
}
