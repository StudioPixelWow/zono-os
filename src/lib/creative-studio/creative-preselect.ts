// ============================================================================
// ZONO — Creative Studio: URL preselection (pure, client-safe). The ONLY source
// of truth for the real goal/format enums the quick-creative engine accepts, and
// safe parsing of ?goal / ?format. A URL only INITIALIZES the UI selection —
// server generation still validates canonical inputs. Invalid values are ignored
// (never passed through), and there are no cross-tenant implications (no ids here).
// Enums verified against quick-creative-engine.ts (QuickType) and the studio
// format literals (service.ts dimension map).
// ============================================================================

export const CREATIVE_GOALS = ["property_ad_post", "sold_post", "testimonial_post"] as const;
export const CREATIVE_FORMATS = ["feed_1_1", "feed_4_5", "story_9_16"] as const;

export type CreativeGoal = (typeof CREATIVE_GOALS)[number];
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export const GOAL_LABEL_HE: Record<CreativeGoal, string> = {
  property_ad_post: "מודעת נכס",
  sold_post: "נמכר / הושכר",
  testimonial_post: "המלצה",
};
export const GOAL_DESC_HE: Record<CreativeGoal, string> = {
  property_ad_post: "קריאייטיב מכירתי לנכס — תמונה, פרטים וקריאה לפעולה",
  sold_post: "להפוך הצלחה לתוכן שיווקי שמביא עוד מוכרים",
  testimonial_post: "להציג הוכחה חברתית של לקוח מרוצה",
};
export const FORMAT_LABEL_HE: Record<CreativeFormat, string> = {
  feed_1_1: "פוסט 1:1",
  feed_4_5: "פוסט 4:5",
  story_9_16: "סטורי 9:16",
};
/** [w, h] ratio units for the miniature canvas in the format picker. */
export const FORMAT_RATIO: Record<CreativeFormat, [number, number]> = {
  feed_1_1: [1, 1],
  feed_4_5: [4, 5],
  story_9_16: [9, 16],
};

// ── CANONICAL FORMAT SPEC — the ONE source of truth for aspect ratio ──────────
// Every layer (engine dims, provider request size, stored master normalization,
// preview aspect-ratio, export dimensions) derives from THIS map — never from an
// ad-hoc `format === "story_9_16" ? … : …` ternary (that footgun silently made
// every non-story format portrait). Add a format here and it is honored end-to-end.
export interface FormatSpec {
  /** Canonical output canvas in pixels — the stored image's intrinsic size. */
  canvas: { w: number; h: number };
  /** CSS aspect-ratio string for preview/frame containers ("W / H"). */
  cssAspect: string;
  /** Nearest gpt-image-1 request size (the model only offers 1024² / 1024×1536 /
   *  1536×1024); the generated master is then normalized (fit:cover) to `canvas`,
   *  so 4:5 and 9:16 are pixel-distinct even though both request the portrait bucket. */
  openaiSize: string;
}
export const FORMAT_SPEC: Record<CreativeFormat, FormatSpec> = {
  feed_1_1: { canvas: { w: 1080, h: 1080 }, cssAspect: "1 / 1", openaiSize: "1024x1024" },
  feed_4_5: { canvas: { w: 1080, h: 1350 }, cssAspect: "4 / 5", openaiSize: "1024x1536" },
  story_9_16: { canvas: { w: 1080, h: 1920 }, cssAspect: "9 / 16", openaiSize: "1024x1536" },
};

export const isCreativeGoal = (x: unknown): x is CreativeGoal => typeof x === "string" && (CREATIVE_GOALS as readonly string[]).includes(x);
export const isCreativeFormat = (x: unknown): x is CreativeFormat => typeof x === "string" && (CREATIVE_FORMATS as readonly string[]).includes(x);

/** Coerce ANY raw format value to a canonical CreativeFormat. Unknown/legacy/
 *  missing → feed_1_1 (the square default — NEVER silently portrait/story). This
 *  is the single fallback used everywhere a stored/legacy format is read back. */
export function coerceCreativeFormat(x: unknown): CreativeFormat {
  return isCreativeFormat(x) ? x : "feed_1_1";
}
/** Canonical output canvas (px) for a format — coerces unknown → feed_1_1. */
export function formatCanvas(x: unknown): { w: number; h: number } {
  return FORMAT_SPEC[coerceCreativeFormat(x)].canvas;
}
/** Nearest provider request size for a format — coerces unknown → feed_1_1. */
export function formatOpenAiSize(x: unknown): string {
  return FORMAT_SPEC[coerceCreativeFormat(x)].openaiSize;
}
/** CSS aspect-ratio string for a format — coerces unknown → feed_1_1. */
export function formatCssAspect(x: unknown): string {
  return FORMAT_SPEC[coerceCreativeFormat(x)].cssAspect;
}

/** Parse ?goal / ?format into validated selections; invalid or missing → null. */
export function parsePreselect(params: { goal?: string | null; format?: string | null }): { goal: CreativeGoal | null; format: CreativeFormat | null } {
  return {
    goal: isCreativeGoal(params.goal) ? params.goal : null,
    format: isCreativeFormat(params.format) ? params.format : null,
  };
}

/** The canonical Distribution handoff for an APPROVED property creative — the
 *  existing /distribution/marketing-plan flow (navigation only; no publishing
 *  engine here). null for non-property entities or non-approved creatives. */
export function distributionHandoffHref(input: { entityType: string; entityId: string; isApproved: boolean }): string | null {
  return input.entityType === "property" && input.isApproved ? `/distribution/marketing-plan/${input.entityId}` : null;
}
