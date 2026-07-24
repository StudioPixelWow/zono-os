// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · DRAFT VERSIONING (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Deterministic content hashing + version snapshots. The hash folds the shared
// content + every target's config (in a canonicalized, order-independent-where-
// appropriate form) so a no-op edit produces the SAME hash (no new version) and a
// meaningful edit changes it (exactly one new version). The snapshot is secret-
// free, provider-neutral, and sufficient to restore the draft. The content hash
// later feeds Phase 3 idempotency.
// ============================================================================
import { createHash } from "node:crypto";
import type { DraftState, DraftTargetState } from "./domain";

/** A canonical, secret-free, restorable snapshot of a draft's content. */
export interface DraftSnapshot {
  internalName: string;
  contentClass: string;
  defaultCaption: string;
  defaultHashtags: readonly string[];
  plannedAt: string | null;
  timezone: string | null;
  targets: ReadonlyArray<{
    assetKind: string; assetId: string; platform: string; contentKind: string; enabled: boolean;
    captionOverride: string | null; hashtagsOverride: readonly string[] | null; mediaOrder: readonly string[]; plannedAt: string | null;
  }>;
}

/** Build the canonical snapshot. Targets are sorted by (platform, assetId) so
 *  reordering targets in memory does not fabricate a change; media ORDER within a
 *  target is significant and preserved. */
export function buildSnapshot(draft: DraftState): DraftSnapshot {
  const targets = [...draft.targets]
    .map((t: DraftTargetState) => ({
      assetKind: t.assetKind, assetId: t.assetId, platform: t.platform, contentKind: t.contentKind, enabled: t.enabled,
      captionOverride: t.captionOverride, hashtagsOverride: t.hashtagsOverride ? [...t.hashtagsOverride] : null,
      mediaOrder: [...t.mediaOrder], plannedAt: t.plannedAt,
    }))
    .sort((a, b) => (a.platform + a.assetId).localeCompare(b.platform + b.assetId));
  return {
    internalName: draft.internalName,
    contentClass: draft.contentClass,
    defaultCaption: draft.defaultCaption,
    defaultHashtags: [...draft.defaultHashtags],
    plannedAt: draft.plannedAt,
    timezone: draft.timezone,
    targets,
  };
}

/** Deterministic content hash over the canonical snapshot. */
export function contentHash(draft: DraftState): string {
  return createHash("sha256").update(JSON.stringify(buildSnapshot(draft))).digest("hex");
}

/** Decide whether a meaningful change occurred (→ create a new version). */
export function shouldCreateVersion(prevHash: string | null, nextHash: string): boolean {
  return prevHash !== nextHash;
}
