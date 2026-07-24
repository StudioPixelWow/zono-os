// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA contracts. Phase 0.
// ----------------------------------------------------------------------------
// Canonical media model: originals stored in ZONO's existing object storage
// (opaque storage ref), validated against per-capability rules (FB vs IG vs
// Reels differ). No transcoding service is built in Phase 0; validation is a
// pure contract. No Graph upload endpoint or container shape appears here.
// ============================================================================
import type { MetaPlatform } from "../types";

export type MetaMediaKind = "image" | "video" | "reel" | "story" | "carousel_item";

export type MetaMediaStatus = "pending" | "validating" | "ready" | "rejected" | "processing" | "failed";

/** A stored media asset — bytes live behind an opaque storage reference. */
export interface MetaMediaAsset {
  id: string;
  orgId: string;
  kind: MetaMediaKind;
  /** Opaque handle into ZONO object storage — never a Meta-hosted URL. */
  storageRef: string;
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Content checksum — the dedup + idempotency material for media. */
  checksum: string;
  status: MetaMediaStatus;
}

/** A per-capability media rule (declarative; enforced by the validator later). */
export interface MetaMediaRequirement {
  platform: MetaPlatform;
  kind: MetaMediaKind;
  allowedMime: readonly string[];
  maxBytes: number;
  minAspect: number | null;
  maxAspect: number | null;
  maxDurationMs: number | null;
}

/** The pure result of validating a media asset against a requirement. */
export interface MetaMediaValidationResult {
  ok: boolean;
  mediaId: string;
  violations: readonly string[];
}
