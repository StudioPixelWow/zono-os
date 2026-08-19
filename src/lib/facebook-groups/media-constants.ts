// ============================================================================
// ZONO — Facebook-groups media constants (PURE, client + server safe, no imports).
// Kept separate from campaign-media.ts (which is `server-only`) so the wizard and
// other client components can import the canonical limit without pulling a
// server-only module into the browser bundle.
// ============================================================================

// Canonical max images per Facebook-group post. NOT invented: mirrors the existing
// Meta content spec `fb_multi_image` maxMedia (src/lib/meta/content/model.ts) and
// Facebook's standard multi-photo post limit. Enforced identically in UI + server.
export const FB_GROUPS_MAX_IMAGES = 10;

/** A single resolved, order-preserved media item persisted on a distribution post. */
export interface ResolvedMediaItem {
  kind: "property_media" | "creative_output" | "property_primary";
  url: string;                       // publishable URL, or creative source url (re-resolved at hand-off)
  creativeOutputId: string | null;   // set for studio creatives → derivative resolved at claim time
  creativeVersion: number | null;
  source: "property" | "studio";
}
