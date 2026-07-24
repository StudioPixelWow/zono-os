// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PLATFORM VARIANTS (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Resolves shared content + explicit per-target overrides into the effective
// content for a target. Shared content is the starting point; overrides are
// explicit and never silently mutate the shared source; removing an override
// returns to the shared value. Provider-neutral.
// ============================================================================
import type { DraftState, DraftTargetState, EffectiveContent } from "./domain";

/** Does the target explicitly override the shared caption/hashtags? */
export function hasCaptionOverride(t: DraftTargetState): boolean {
  return t.captionOverride !== null;
}
export function hasHashtagsOverride(t: DraftTargetState): boolean {
  return t.hashtagsOverride !== null;
}

/** Resolve the effective content for one target (shared unless overridden). */
export function resolveEffectiveContent(draft: DraftState, target: DraftTargetState): EffectiveContent {
  return {
    platform: target.platform,
    contentKind: target.contentKind,
    caption: target.captionOverride ?? draft.defaultCaption,
    hashtags: target.hashtagsOverride ?? draft.defaultHashtags,
    mediaOrder: target.mediaOrder,
  };
}

/** Return a target with its caption override cleared (back to shared). */
export function clearCaptionOverride(t: DraftTargetState): DraftTargetState {
  return { ...t, captionOverride: null };
}
/** Return a target with its hashtags override cleared (back to shared). */
export function clearHashtagsOverride(t: DraftTargetState): DraftTargetState {
  return { ...t, hashtagsOverride: null };
}

/** Resolve effective content for every enabled target. */
export function resolveAllEffective(draft: DraftState): ReadonlyArray<{ targetId: string; effective: EffectiveContent }> {
  return draft.targets.filter((t) => t.enabled).map((t) => ({ targetId: t.id, effective: resolveEffectiveContent(draft, t) }));
}
