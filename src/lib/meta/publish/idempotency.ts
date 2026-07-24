// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH IDEMPOTENCY (PURE). Phase 3A.
// ----------------------------------------------------------------------------
// Operation-level + target-level idempotency keys, extending the Phase-0 helper.
// The SERVER computes/verifies these — browser-supplied keys are never trusted.
// Same logical command → same key → resume the existing operation (duplicate
// clicks never create duplicate posts). Different content / version / target-set
// → different keys. No secret is ever part of the material.
// ============================================================================
import { createHash } from "node:crypto";
import type { MetaPlatform } from "../types";
import { createMetaPublishingIdempotencyKey } from "./types";

/** A stable, order-independent hash of the selected canonical target set. */
export function targetSetHash(targets: ReadonlyArray<{ assetId: string; platform: MetaPlatform; contentKind: string }>): string {
  const canon = [...targets]
    .map((t) => `${t.platform}:${t.assetId}:${t.contentKind}`)
    .sort()
    .join(",");
  return createHash("sha256").update(canon).digest("hex").slice(0, 32);
}

export interface OperationIdemInput {
  orgId: string;
  draftId: string;
  draftVersionNumber: number;
  contentHash: string;
  targetSetHash: string;
  variant: MetaPlatform | "default";
}

/** Operation-level idempotency key (immediate mode). */
export function operationIdempotencyKey(input: OperationIdemInput): string {
  const material = [
    `org=${input.orgId.trim()}`,
    `draft=${input.draftId.trim()}`,
    `version=${input.draftVersionNumber}`,
    `content=${input.contentHash.trim()}`,
    `targets=${input.targetSetHash}`,
    `mode=immediate`,
    `variant=${(input.variant || "default").trim().toLowerCase()}`,
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}

export interface TargetIdemInput {
  orgId: string;
  operationKey: string;
  assetId: string;
  platform: MetaPlatform;
  contentHash: string;
  targetVariantHash: string;
}

/** Target-level idempotency key — reuses the Phase-0 helper's shape + operation material. */
export function targetIdempotencyKey(input: TargetIdemInput): string {
  const base = String(createMetaPublishingIdempotencyKey({ orgId: input.orgId, draftId: input.operationKey, assetId: input.assetId, contentHash: input.contentHash, scheduledTime: "immediate", variant: input.platform }));
  return createHash("sha256").update(`${base}|tv=${input.targetVariantHash}`).digest("hex");
}

/** Per-target variant hash (content that differs per target: caption/hashtags/media order). */
export function targetVariantHash(caption: string, hashtags: readonly string[], mediaOrder: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify({ caption, hashtags: [...hashtags], mediaOrder: [...mediaOrder] })).digest("hex").slice(0, 32);
}
