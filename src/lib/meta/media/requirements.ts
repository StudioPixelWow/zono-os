// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA REQUIREMENTS. Phase 2.
// ----------------------------------------------------------------------------
// The SINGLE, versioned source of canonical media requirements per (platform,
// content kind). The UI and content services consume THESE canonical rules —
// platform limits are never scattered across components. Requirements are
// classified by certainty: `canonical` product constraints we own, `provider`
// compatibility constraints (values Meta enforces), and `uncertain` values that
// need live verification. Provider-specific mappings may be refined in the Graph
// compatibility layer later; consumers always read the canonical shape here.
// ============================================================================
import type { MetaPlatform } from "../types";

/** Bump when any rule changes — recorded on every validation result. */
export const MEDIA_RULESET_VERSION = "2026.12.1";

export type MediaCertainty = "canonical" | "provider" | "uncertain";

export interface MediaRequirement {
  platform: MetaPlatform;
  contentKind: string;
  mediaKind: "image" | "video";
  allowedMime: readonly string[];
  maxBytes: number;
  minAspect: number | null; // width/height
  maxAspect: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  maxItems: number; // carousel / multi-image ceiling (1 = single)
  certainty: MediaCertainty;
  notes: string;
}

const IMG = ["image/jpeg", "image/png", "image/webp"] as const;
const VID = ["video/mp4", "video/quicktime"] as const;

// Canonical requirements. Byte/aspect/duration ceilings marked `provider` are the
// values Meta enforces (documented); `uncertain` ones should be re-verified live.
const REQUIREMENTS: readonly MediaRequirement[] = [
  // ── Facebook Page ──────────────────────────────────────────────────────
  { platform: "facebook", contentKind: "image", mediaKind: "image", allowedMime: IMG, maxBytes: 30_000_000, minAspect: 0.1, maxAspect: 10, minDurationMs: null, maxDurationMs: null, maxItems: 1, certainty: "provider", notes: "FB single image." },
  { platform: "facebook", contentKind: "multi_image", mediaKind: "image", allowedMime: IMG, maxBytes: 30_000_000, minAspect: 0.1, maxAspect: 10, minDurationMs: null, maxDurationMs: null, maxItems: 10, certainty: "provider", notes: "FB multi-image (up to ~10)." },
  { platform: "facebook", contentKind: "video", mediaKind: "video", allowedMime: VID, maxBytes: 1_000_000_000, minAspect: 0.5, maxAspect: 2.0, minDurationMs: 1_000, maxDurationMs: 1_200_000, maxItems: 1, certainty: "uncertain", notes: "FB feed video; exact ceilings need live verification." },
  { platform: "facebook", contentKind: "text", mediaKind: "image", allowedMime: IMG, maxBytes: 0, minAspect: null, maxAspect: null, minDurationMs: null, maxDurationMs: null, maxItems: 0, certainty: "canonical", notes: "Text post carries no media." },
  { platform: "facebook", contentKind: "link", mediaKind: "image", allowedMime: IMG, maxBytes: 30_000_000, minAspect: null, maxAspect: null, minDurationMs: null, maxDurationMs: null, maxItems: 1, certainty: "canonical", notes: "Link post; media optional (link preview owned by Meta)." },
  // ── Instagram Professional ────────────────────────────────────────────
  { platform: "instagram", contentKind: "image", mediaKind: "image", allowedMime: ["image/jpeg"], maxBytes: 8_000_000, minAspect: 0.8, maxAspect: 1.91, minDurationMs: null, maxDurationMs: null, maxItems: 1, certainty: "provider", notes: "IG feed image (JPEG; ~4:5 to 1.91:1)." },
  { platform: "instagram", contentKind: "carousel", mediaKind: "image", allowedMime: ["image/jpeg"], maxBytes: 8_000_000, minAspect: 0.8, maxAspect: 1.91, minDurationMs: null, maxDurationMs: null, maxItems: 10, certainty: "provider", notes: "IG carousel (2–10 items)." },
  { platform: "instagram", contentKind: "video", mediaKind: "video", allowedMime: ["video/mp4"], maxBytes: 100_000_000, minAspect: 0.8, maxAspect: 1.91, minDurationMs: 3_000, maxDurationMs: 600_000, maxItems: 1, certainty: "uncertain", notes: "IG feed video; exact ceilings need live verification." },
];

const key = (p: MetaPlatform, k: string) => `${p}:${k}`;
const BY_KEY = new Map(REQUIREMENTS.map((r) => [key(r.platform, r.contentKind), r]));

/** Canonical requirement for a (platform, content kind), or null if none. */
export function mediaRequirement(platform: MetaPlatform, contentKind: string): MediaRequirement | null {
  return BY_KEY.get(key(platform, contentKind)) ?? null;
}

/** All canonical requirements (for UI enumeration). */
export function allMediaRequirements(): readonly MediaRequirement[] {
  return REQUIREMENTS;
}

/** Global upload guards (independent of a specific target). */
export const UPLOAD_GUARDS = {
  allowedImageMime: IMG,
  allowedVideoMime: VID,
  maxImageBytes: 30_000_000,
  maxVideoBytes: 1_000_000_000,
} as const;
