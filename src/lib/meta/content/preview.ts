// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PREVIEW ENGINE (PURE). Phase 2.
// ----------------------------------------------------------------------------
// A provider-neutral, APPROXIMATE preview. It does NOT reproduce Meta UI pixel-
// perfectly, never scrapes Meta, and uses no browser automation. Every preview is
// explicitly marked as an approximation and carries truncation / unsupported-field
// warnings, the validation state, the approval state, and the planned time. NO
// Graph payload field appears in the output.
// ============================================================================
import type { DraftState, DraftTargetState } from "./domain";
import { contentKind } from "./model";
import { resolveEffectiveContent } from "./variant";
import type { TargetReadiness } from "./validate";

export interface PreviewMediaItem {
  mediaId: string;
  displayName: string;
  kind: "image" | "video";
  aspectHint: string; // e.g. "1:1", "1.91:1"
}

export interface TargetPreview {
  approximate: true; // always — this is never a pixel-perfect render
  platform: string;
  contentKind: string;
  assetDisplay: string;
  caption: string;
  hashtags: readonly string[];
  media: readonly PreviewMediaItem[];
  truncationWarning: string | null;
  unsupportedWarnings: readonly string[];
  readiness: TargetReadiness;
  approvalState: string;
  plannedAt: string | null;
  marker: string;
}

export interface PreviewInputs {
  assetDisplay: string;
  media: (mediaId: string) => { displayName: string; kind: "image" | "video"; aspectHint: string } | null;
  readiness: TargetReadiness;
}

/** Build an approximate, provider-neutral preview for one target. */
export function buildTargetPreview(draft: DraftState, target: DraftTargetState, inputs: PreviewInputs): TargetPreview {
  const def = contentKind(target.contentKind);
  const eff = resolveEffectiveContent(draft, target);
  const media: PreviewMediaItem[] = [];
  for (const id of eff.mediaOrder) {
    const m = inputs.media(id);
    if (m) media.push({ mediaId: id, displayName: m.displayName, kind: m.kind, aspectHint: m.aspectHint });
  }
  const maxCaption = def?.maxCaption ?? 2200;
  const truncationWarning = maxCaption > 0 && eff.caption.length > maxCaption
    ? `Caption is ${eff.caption.length} chars; ${target.platform} shows up to ~${maxCaption}.`
    : null;

  const unsupported: string[] = [];
  if (def && def.maxCaption === 0 && eff.caption.trim()) unsupported.push("This content kind does not display a caption.");
  if (def && !def.enabled) unsupported.push("This content kind is not available in the current phase.");
  if (target.platform === "instagram" && eff.hashtags.length > 30) unsupported.push("Instagram shows at most 30 hashtags.");

  return {
    approximate: true,
    platform: target.platform,
    contentKind: target.contentKind,
    assetDisplay: inputs.assetDisplay,
    caption: eff.caption,
    hashtags: eff.hashtags,
    media,
    truncationWarning,
    unsupportedWarnings: unsupported,
    readiness: inputs.readiness,
    approvalState: draft.approvalState,
    plannedAt: target.plannedAt ?? draft.plannedAt,
    marker: "APPROXIMATE PREVIEW — not a live Meta render",
  };
}
