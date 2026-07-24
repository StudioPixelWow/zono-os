// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA VALIDATION (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Deterministic, CENTRALIZED media validation. All platform limits come from the
// versioned `requirements` table — never scattered in UI. Returns a structured
// result (status + codes + human messages + affected target + remediation +
// whether a derived variant is required). Every result records the ruleset
// version. No provider call, no Graph literal.
// ============================================================================
import type { MetaPlatform } from "../types";
import { mediaRequirement, UPLOAD_GUARDS, MEDIA_RULESET_VERSION } from "./requirements";

export type MediaValidationStatus = "valid" | "invalid" | "warning";

export interface MediaValidationCode {
  code: string;
  message: string;
  remediation: string | null;
  severity: "error" | "warning";
}

export interface MediaValidationResult {
  status: MediaValidationStatus;
  rulesetVersion: string;
  codes: readonly MediaValidationCode[];
  affectedTarget: string | null; // `${platform}:${contentKind}` when target-scoped
  variantRequired: boolean;
}

export interface MediaFacts {
  mediaKind: "image" | "video";
  /** The SERVER-INSPECTED mime — never the browser-declared one. */
  actualMime: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

const err = (code: string, message: string, remediation: string | null = null): MediaValidationCode => ({ code, message, remediation, severity: "error" });
const warn = (code: string, message: string, remediation: string | null = null): MediaValidationCode => ({ code, message, remediation, severity: "warning" });

/** Upload-time validation (independent of a target): mime + size sanity. */
export function validateUpload(facts: MediaFacts, declaredMime?: string): MediaValidationResult {
  const codes: MediaValidationCode[] = [];
  const allowed = facts.mediaKind === "image" ? UPLOAD_GUARDS.allowedImageMime : UPLOAD_GUARDS.allowedVideoMime;
  if (!allowed.includes(facts.actualMime as never)) {
    codes.push(err("mime_not_allowed", `Unsupported ${facts.mediaKind} type: ${facts.actualMime}`, `Use one of: ${allowed.join(", ")}`));
  }
  // MIME spoofing: the browser-declared type disagreeing with the inspected type.
  if (declaredMime && declaredMime !== facts.actualMime) {
    codes.push(err("mime_spoofed", "Declared file type does not match the actual file contents", "Re-upload the original file"));
  }
  const maxBytes = facts.mediaKind === "image" ? UPLOAD_GUARDS.maxImageBytes : UPLOAD_GUARDS.maxVideoBytes;
  if (facts.fileSize > maxBytes) {
    codes.push(err("file_too_large", `File exceeds the ${(maxBytes / 1_000_000) | 0}MB limit`, "Compress or resize the file"));
  }
  if (facts.fileSize <= 0) codes.push(err("empty_file", "The uploaded file is empty"));
  return { status: codes.length ? "invalid" : "valid", rulesetVersion: MEDIA_RULESET_VERSION, codes, affectedTarget: null, variantRequired: false };
}

/** Target-scoped validation against the canonical requirement for a platform/kind. */
export function validateMediaForTarget(facts: MediaFacts, platform: MetaPlatform, contentKind: string): MediaValidationResult {
  const req = mediaRequirement(platform, contentKind);
  const target = `${platform}:${contentKind}`;
  const codes: MediaValidationCode[] = [];
  let variantRequired = false;

  if (!req) {
    return { status: "invalid", rulesetVersion: MEDIA_RULESET_VERSION, codes: [err("no_requirement", `No media requirement defined for ${target}`)], affectedTarget: target, variantRequired: false };
  }
  if (req.maxItems === 0) {
    // Text post: media not expected — not an error at the media level.
    return { status: "valid", rulesetVersion: MEDIA_RULESET_VERSION, codes: [], affectedTarget: target, variantRequired: false };
  }
  if (req.mediaKind !== facts.mediaKind) {
    codes.push(err("wrong_media_kind", `${target} expects ${req.mediaKind}, got ${facts.mediaKind}`));
  }
  if (!req.allowedMime.includes(facts.actualMime)) {
    // For video an unsupported container is a candidate for a transcoded variant.
    if (facts.mediaKind === "video") { variantRequired = true; codes.push(warn("variant_required", `${target} requires ${req.allowedMime.join("/")}; a converted variant is required`, "A converted video variant must be produced before this target is publishable")); }
    else codes.push(err("mime_not_allowed_target", `${target} does not accept ${facts.actualMime}`, `Use ${req.allowedMime.join(", ")}`));
  }
  if (req.maxBytes > 0 && facts.fileSize > req.maxBytes) {
    codes.push(err("target_too_large", `${target} limit is ${(req.maxBytes / 1_000_000) | 0}MB`, "Compress or resize"));
  }
  const aspect = facts.width && facts.height ? facts.width / facts.height : null;
  if (aspect != null && req.minAspect != null && req.maxAspect != null && (aspect < req.minAspect - 1e-6 || aspect > req.maxAspect + 1e-6)) {
    codes.push(err("aspect_out_of_range", `${target} aspect ratio must be between ${req.minAspect} and ${req.maxAspect}`, "Crop the media to an accepted aspect ratio"));
  }
  if (facts.durationMs != null) {
    if (req.minDurationMs != null && facts.durationMs < req.minDurationMs) codes.push(err("too_short", `${target} minimum duration is ${(req.minDurationMs / 1000) | 0}s`));
    if (req.maxDurationMs != null && facts.durationMs > req.maxDurationMs) codes.push(err("too_long", `${target} maximum duration is ${(req.maxDurationMs / 1000) | 0}s`, "Trim the video"));
  }
  const hasError = codes.some((c) => c.severity === "error");
  const status: MediaValidationStatus = hasError ? "invalid" : codes.length ? "warning" : "valid";
  return { status, rulesetVersion: MEDIA_RULESET_VERSION, codes, affectedTarget: target, variantRequired };
}
