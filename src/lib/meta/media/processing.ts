// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA PROCESSING BOUNDARY. Phase 2.
// ----------------------------------------------------------------------------
// A processing BOUNDARY — NOT a bespoke transcoding system. It declares the
// contracts (metadata extraction, image derivative, video thumbnail, target
// variant) and reports honestly which operations are implemented locally,
// delegated to existing infrastructure, contract-only, or deferred. When a
// required transform is unavailable (e.g. video transcoding), it records
// `variant_required` and keeps the target INVALID — it never fakes a variant or
// silently degrades quality.
// ============================================================================

export type ProcessingCapability = "implemented_local" | "delegated" | "contract_only" | "deferred";

export interface ProcessingOperation {
  op: "metadata_extract" | "image_derivative" | "video_thumbnail" | "target_variant";
  capability: ProcessingCapability;
  note: string;
}

/** Honest declaration of what Phase 2 processing does. */
export const PROCESSING_MATRIX: readonly ProcessingOperation[] = [
  { op: "metadata_extract", capability: "delegated", note: "Server-side inspection (dimensions/mime/duration) via the injected metadata port; no bytes held in app memory." },
  { op: "image_derivative", capability: "contract_only", note: "Derivative request modeled; produced by existing storage/image infra when configured, else the original is referenced." },
  { op: "video_thumbnail", capability: "contract_only", note: "Thumbnail request modeled; produced by existing infra when available." },
  { op: "target_variant", capability: "deferred", note: "Video transcoding is NOT built. When a target needs a converted variant the state is variant_required and the target stays invalid." },
];

export type VariantProcessingStatus = "pending" | "processing" | "ready" | "failed" | "variant_required";

export interface VariantRequest {
  mediaAssetId: string;
  variantKey: string;
  targetPlatform: "facebook" | "instagram" | null;
  intendedContentKind: string | null;
}

export interface VariantOutcome {
  request: VariantRequest;
  status: VariantProcessingStatus;
  /** Storage ref when ready (may equal the original when no transform is needed). */
  storageRef: string | null;
  message: string | null;
}

/**
 * Decide the variant outcome WITHOUT performing transcoding. If the source is
 * already acceptable, the variant references the original (`ready`). If a
 * transform (e.g. transcode) would be required but is unavailable, the outcome is
 * an honest `variant_required` — never a faked success.
 */
export function resolveVariant(req: VariantRequest, opts: { transformNeeded: boolean; originalStorageRef: string; transcodeAvailable: boolean }): VariantOutcome {
  if (!opts.transformNeeded) {
    return { request: req, status: "ready", storageRef: opts.originalStorageRef, message: "no transform required — references the original" };
  }
  if (opts.transcodeAvailable) {
    // Would be delegated to existing infra; contract path only in Phase 2.
    return { request: req, status: "processing", storageRef: null, message: "variant delegated to processing infrastructure" };
  }
  return { request: req, status: "variant_required", storageRef: null, message: "a converted variant is required but transcoding is not available — target remains invalid" };
}
