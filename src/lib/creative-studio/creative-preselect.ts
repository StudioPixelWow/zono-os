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

export const isCreativeGoal = (x: unknown): x is CreativeGoal => typeof x === "string" && (CREATIVE_GOALS as readonly string[]).includes(x);
export const isCreativeFormat = (x: unknown): x is CreativeFormat => typeof x === "string" && (CREATIVE_FORMATS as readonly string[]).includes(x);

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
