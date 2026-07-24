// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH SNAPSHOT (PURE). Phase 3A.
// ----------------------------------------------------------------------------
// An IMMUTABLE snapshot captured at operation creation. Target execution reads
// ONLY the snapshot — never mutable draft fields. Editing the draft after the
// operation is created cannot change the operation; a later edit requires a new
// approval and a new operation. Provider-neutral; no Graph payload, no secret.
// ============================================================================
import type { MetaPlatform } from "../types";
import type { DraftState } from "../content/domain";
import { resolveEffectiveContent } from "../content/variant";
import { operationIdempotencyKey, targetSetHash, targetIdempotencyKey, targetVariantHash } from "./idempotency";
import type { MetaCapabilityDecision } from "../capability/types";

export interface SnapshotMediaRef {
  mediaId: string;
  kind: "image" | "video";
  storageRef: string;
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface SnapshotTarget {
  draftTargetId: string;
  platform: MetaPlatform;
  assetKind: "page" | "instagram";
  assetId: string;
  contentKind: string;
  caption: string;
  hashtags: readonly string[];
  media: readonly SnapshotMediaRef[];
  capabilityDecision: MetaCapabilityDecision;
  validationSnapshot: unknown;
  idempotencyKey: string;
}

export interface PublishSnapshot {
  orgId: string;
  draftId: string;
  draftVersionNumber: number;
  contentHash: string;
  variant: MetaPlatform | "default";
  requestedBy: string | null;
  correlationId: string;
  createdAt: string;
  operationIdempotencyKey: string;
  targets: readonly SnapshotTarget[];
}

export interface BuildSnapshotInput {
  draft: DraftState;
  targetIds: readonly string[];
  media: (mediaId: string) => SnapshotMediaRef | null;
  capability: (targetId: string) => MetaCapabilityDecision;
  validation: (targetId: string) => unknown;
  requestedBy: string | null;
  correlationId: string;
  createdAt: string;
}

/** Build the immutable publish snapshot from the approved draft. */
export function buildPublishSnapshot(input: BuildSnapshotInput): PublishSnapshot {
  const { draft } = input;
  const selected = draft.targets.filter((t) => input.targetIds.includes(t.id) && t.enabled);
  const setHash = targetSetHash(selected.map((t) => ({ assetId: t.assetId, platform: t.platform, contentKind: t.contentKind })));
  const opKey = operationIdempotencyKey({ orgId: draft.orgId, draftId: draft.id, draftVersionNumber: draft.currentVersion, contentHash: draft.contentHash ?? "", targetSetHash: setHash, variant: "default" });

  const targets: SnapshotTarget[] = selected.map((t) => {
    const eff = resolveEffectiveContent(draft, t);
    const media = eff.mediaOrder.map((id) => input.media(id)).filter((m): m is SnapshotMediaRef => !!m);
    const tvHash = targetVariantHash(eff.caption, eff.hashtags, eff.mediaOrder);
    return {
      draftTargetId: t.id,
      platform: t.platform,
      assetKind: t.assetKind,
      assetId: t.assetId,
      contentKind: t.contentKind,
      caption: eff.caption,
      hashtags: eff.hashtags,
      media,
      capabilityDecision: input.capability(t.id),
      validationSnapshot: input.validation(t.id),
      idempotencyKey: targetIdempotencyKey({ orgId: draft.orgId, operationKey: opKey, assetId: t.assetId, platform: t.platform, contentHash: draft.contentHash ?? "", targetVariantHash: tvHash }),
    };
  });

  return {
    orgId: draft.orgId,
    draftId: draft.id,
    draftVersionNumber: draft.currentVersion,
    contentHash: draft.contentHash ?? "",
    variant: "default",
    requestedBy: input.requestedBy,
    correlationId: input.correlationId,
    createdAt: input.createdAt,
    operationIdempotencyKey: opKey,
    targets,
  };
}
