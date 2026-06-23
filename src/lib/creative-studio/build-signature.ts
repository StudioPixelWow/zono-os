// ============================================================================
// ZONO — Build Signature (client-safe, diagnostic only)
// ----------------------------------------------------------------------------
// Proves WHICH build is actually running. The version strings below only exist
// in the new creative engine — an old deployment won't render this signature at
// all, and even if it does, the commit hash + versions will differ. Bump the
// version strings whenever the matching engine changes.
// ============================================================================

export const RENDERER_VERSION = "dep-canvas-1.0";          // DEP-driven renderer (executes Design Execution Plan)
export const CONCEPT_ENGINE_VERSION = "concepts-4distinct-1.0"; // 4 strategically distinct concepts (luxury/urgency/family/investment/price)
export const DESIGN_SYSTEM_VERSION = "families-5-1.0";     // 5 fixed design families + zone-map DEP

/** Date stamped into the source — bumped on each creative-engine change. Lets you
 *  tell the source version apart even when the commit env var is unavailable. */
export const BUILD_SIGNED_AT = "2026-06-23";

const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || "";

export const BUILD_SIGNATURE = {
  commit: sha ? sha.slice(0, 7) : "local-dev",
  branch: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF || "local",
  signedAt: BUILD_SIGNED_AT,
  rendererVersion: RENDERER_VERSION,
  conceptEngineVersion: CONCEPT_ENGINE_VERSION,
  designSystemVersion: DESIGN_SYSTEM_VERSION,
} as const;
