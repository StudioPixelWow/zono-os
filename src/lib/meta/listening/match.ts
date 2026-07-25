// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MENTION MATCHING (PURE decision). Phase 5.
// ----------------------------------------------------------------------------
// Deterministic matching ORDER, expressed as a pure decision over already-resolved
// trusted candidates (the store performs the trusted lookups; org is NEVER inferred
// from author identity or free text). Order: trusted asset → exact provider-object
// ref → canonical post/media mapping (Batch-6.8) → safe parent-child evidence →
// unmatched. An unmatched mention stays bound to its trusted source/asset/org.
// ============================================================================
import type { MatchState } from "./domain";

export interface MatchCandidates {
  trustedAssetId: string;                       // ALWAYS present (source is asset-derived, trusted)
  providerObjectByRef: string | null;           // exact external provider-object ref match
  providerObjectByCanonicalMapping: string | null;   // Batch-6.8 canonical post/media mapping
  providerObjectByParentChild: string | null;   // safe parent-child provider evidence
}
export interface MatchResult { matchState: MatchState; matchedAssetId: string; matchedProviderObjectId: string | null }

/** Decide the match deterministically (highest-confidence provider evidence first). */
export function decideMatch(c: MatchCandidates): MatchResult {
  if (c.providerObjectByRef) return { matchState: "provider_object", matchedAssetId: c.trustedAssetId, matchedProviderObjectId: c.providerObjectByRef };
  if (c.providerObjectByCanonicalMapping) return { matchState: "canonical_mapping", matchedAssetId: c.trustedAssetId, matchedProviderObjectId: c.providerObjectByCanonicalMapping };
  if (c.providerObjectByParentChild) return { matchState: "parent_child", matchedAssetId: c.trustedAssetId, matchedProviderObjectId: c.providerObjectByParentChild };
  // No provider-object evidence — the mention is still validly bound to the trusted
  // asset/org (never fabricate a provider-object relation).
  return { matchState: c.trustedAssetId ? "asset" : "unmatched", matchedAssetId: c.trustedAssetId, matchedProviderObjectId: null };
}

/** A mention is "actionable" (inbox-projectable) when it is at least asset-matched. */
export function isActionable(m: MatchResult): boolean {
  return m.matchState !== "unmatched" && !!m.matchedAssetId;
}
