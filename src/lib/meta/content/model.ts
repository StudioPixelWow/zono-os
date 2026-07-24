// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONTENT MODEL. Phase 2.
// ----------------------------------------------------------------------------
// The canonical cross-platform content model. It does NOT pretend Facebook and
// Instagram are identical: each content kind is declared per platform, mapped to
// its required canonical capability + media requirement, and classified MVP vs
// Extended. Extended kinds exist in the contract but are DISABLED — a kind is
// never enabled merely because its type exists. Facebook Groups is absent.
// ============================================================================
import type { MetaPlatform } from "../types";

export interface ContentKindDef {
  key: string;               // canonical content-kind key (e.g. "fb_image")
  platform: MetaPlatform;
  label: string;
  /** MVP kinds are enabled; Extended kinds are declared but disabled. */
  enabled: boolean;
  classification: "mvp" | "extended";
  /** Canonical capability required to publish this kind (Phase 3). */
  requiredCapability: string;
  /** The media requirement key (see media/requirements). */
  mediaContentKind: string;
  mediaRequired: boolean;
  minMedia: number;
  maxMedia: number;
  /** Max caption length (canonical; provider ceilings may be stricter). */
  maxCaption: number;
}

const K = (d: ContentKindDef) => d;

export const CONTENT_KINDS: readonly ContentKindDef[] = [
  // ── Facebook Page (MVP) ────────────────────────────────────────────────
  K({ key: "fb_text", platform: "facebook", label: "Text post", enabled: true, classification: "mvp", requiredCapability: "facebook.content.publish", mediaContentKind: "text", mediaRequired: false, minMedia: 0, maxMedia: 0, maxCaption: 63206 }),
  K({ key: "fb_link", platform: "facebook", label: "Link post", enabled: true, classification: "mvp", requiredCapability: "facebook.content.publish", mediaContentKind: "link", mediaRequired: false, minMedia: 0, maxMedia: 1, maxCaption: 63206 }),
  K({ key: "fb_image", platform: "facebook", label: "Image post", enabled: true, classification: "mvp", requiredCapability: "facebook.content.publish", mediaContentKind: "image", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 63206 }),
  K({ key: "fb_multi_image", platform: "facebook", label: "Multi-image post", enabled: true, classification: "mvp", requiredCapability: "facebook.content.publish", mediaContentKind: "multi_image", mediaRequired: true, minMedia: 2, maxMedia: 10, maxCaption: 63206 }),
  K({ key: "fb_video", platform: "facebook", label: "Video post", enabled: true, classification: "mvp", requiredCapability: "facebook.content.publish", mediaContentKind: "video", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 63206 }),
  // ── Instagram Professional (MVP) ───────────────────────────────────────
  K({ key: "ig_image", platform: "instagram", label: "Image feed post", enabled: true, classification: "mvp", requiredCapability: "instagram.content.publish", mediaContentKind: "image", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 2200 }),
  K({ key: "ig_video", platform: "instagram", label: "Video feed post", enabled: true, classification: "mvp", requiredCapability: "instagram.content.publish", mediaContentKind: "video", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 2200 }),
  K({ key: "ig_carousel", platform: "instagram", label: "Carousel", enabled: true, classification: "mvp", requiredCapability: "instagram.content.publish", mediaContentKind: "carousel", mediaRequired: true, minMedia: 2, maxMedia: 10, maxCaption: 2200 }),
  // ── Extended (DECLARED, DISABLED) ──────────────────────────────────────
  K({ key: "fb_reel", platform: "facebook", label: "Facebook Reel", enabled: false, classification: "extended", requiredCapability: "facebook.reels.publish", mediaContentKind: "video", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 63206 }),
  K({ key: "fb_story", platform: "facebook", label: "Facebook Story", enabled: false, classification: "extended", requiredCapability: "facebook.stories.publish", mediaContentKind: "image", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 0 }),
  K({ key: "ig_reel", platform: "instagram", label: "Instagram Reel", enabled: false, classification: "extended", requiredCapability: "instagram.reels.publish", mediaContentKind: "video", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 2200 }),
  K({ key: "ig_story", platform: "instagram", label: "Instagram Story", enabled: false, classification: "extended", requiredCapability: "instagram.stories.publish", mediaContentKind: "image", mediaRequired: true, minMedia: 1, maxMedia: 1, maxCaption: 0 }),
  K({ key: "ig_first_comment", platform: "instagram", label: "Instagram first comment", enabled: false, classification: "extended", requiredCapability: "instagram.first_comment.publish", mediaContentKind: "text", mediaRequired: false, minMedia: 0, maxMedia: 0, maxCaption: 2200 }),
];

const BY_KEY = new Map(CONTENT_KINDS.map((c) => [c.key, c]));

export function contentKind(key: string): ContentKindDef | null {
  return BY_KEY.get(key) ?? null;
}

/** Enabled content kinds for a platform (MVP only). */
export function enabledContentKinds(platform: MetaPlatform): readonly ContentKindDef[] {
  return CONTENT_KINDS.filter((c) => c.platform === platform && c.enabled);
}
