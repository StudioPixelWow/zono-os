// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SHARED PRIMITIVES. Phase 0.
// ----------------------------------------------------------------------------
// Cross-cutting, transport-neutral primitives shared by every Meta submodule.
// Nothing Graph-specific lives here (no endpoints, no versions, no raw scopes,
// no "access_token"). This file is a barrel of small canonical building blocks;
// the domain contracts live under their respective subfolders.
// ============================================================================

/** Nominal typing helper — brands a primitive so ids can't be crossed. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** The two publishing surfaces Meta Workspace targets. */
export type MetaPlatform = "facebook" | "instagram";

/** Coarse capability scope groups (canonical, not Graph permission names). */
export type MetaScopeGroup =
  | "connection"
  | "assets"
  | "content"
  | "comments"
  | "messaging"
  | "analytics"
  | "webhooks"
  | "engagement";

/**
 * The classification of a capability against the roadmap. Excluded capabilities
 * are permanently denied; Extended are off until explicitly enabled; MVP are the
 * conservative launch set.
 */
export type MetaCapabilityClass = "mvp" | "extended" | "excluded";

/** ISO-8601 timestamp alias (documentation only). */
export type MetaTimestamp = string;
