// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISHING contracts + idempotency.
// ----------------------------------------------------------------------------
// Canonical publishing request/result model and the PURE idempotency-key helper.
// One publish per (draft, asset): the key deterministically folds org + draft +
// asset + content hash + schedule + variant, and NEVER includes a secret. No
// database persistence and no Graph call happens in Phase 0.
// ============================================================================
import { createHash } from "node:crypto";
import type { Brand, MetaPlatform } from "../types";
import type { MetaAssetRef } from "../assets/types";

/** A stable idempotency key for a single (draft,asset,variant,schedule) op. */
export type MetaIdempotencyKey = Brand<string, "MetaIdempotencyKey">;

export type MetaPublishingJobState =
  | "queued"
  | "publishing"
  | "published"
  | "partially_published"
  | "failed"
  | "retrying"
  | "cancelled"
  | "dead_letter";

/** A request to publish one draft across its targets. */
export interface MetaPublishingRequest {
  orgId: string;
  draftId: string;
  targets: readonly MetaAssetRef[];
  contentHash: string;
  /** ISO time for a scheduled publish, or null for immediate. */
  scheduledAt: string | null;
  platformVariant: MetaPlatform | "default";
}

/** The per-asset outcome of a publish attempt. */
export interface MetaPublishingTargetResult {
  asset: MetaAssetRef;
  ok: boolean;
  /** Canonical id of the published object (opaque), when succeeded. */
  externalPostId: string | null;
  error: MetaPublishingError | null;
}

/** A publish error, safe metadata only (mirrors the provider error taxonomy). */
export interface MetaPublishingError {
  kind: string;
  retryable: boolean;
  safeMessage: string;
}

/** The overall result of a publishing request. */
export interface MetaPublishingResult {
  requestId: string;
  state: MetaPublishingJobState;
  perTarget: readonly MetaPublishingTargetResult[];
}

/** The canonicalized material that feeds the idempotency hash. */
export interface MetaIdempotencyInput {
  orgId: string;
  draftId: string;
  /** Canonical asset id (uuid) — order-independent across targets. */
  assetId: string;
  contentHash: string;
  /** ISO schedule time, or the literal "immediate". */
  scheduledTime: string | "immediate";
  /** The platform variant, or "default". */
  variant: MetaPlatform | "default";
}

/**
 * PURE, deterministic idempotency-key builder. Identical input → identical key;
 * any change to asset / content / schedule / variant changes the key. Fields are
 * canonicalized (trimmed, lower-cased where safe, immediate-normalized) so
 * order-independent inputs hash stably. No secret is ever part of the material.
 */
export function createMetaPublishingIdempotencyKey(input: MetaIdempotencyInput): MetaIdempotencyKey {
  const scheduled = input.scheduledTime === "immediate" || !input.scheduledTime ? "immediate" : new Date(input.scheduledTime).toISOString();
  // Canonical, delimiter-safe material. Keys are sorted implicitly by fixed order.
  const material = [
    `org=${input.orgId.trim()}`,
    `draft=${input.draftId.trim()}`,
    `asset=${input.assetId.trim()}`,
    `content=${input.contentHash.trim()}`,
    `schedule=${scheduled}`,
    `variant=${(input.variant || "default").trim().toLowerCase()}`,
  ].join("|");
  return createHash("sha256").update(material).digest("hex") as MetaIdempotencyKey;
}
