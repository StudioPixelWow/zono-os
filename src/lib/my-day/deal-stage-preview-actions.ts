"use server";
// ============================================================================
// ZONO — Deal-stage hover preview: server action. Thin delegation to the
// canonical bounded selector (org/stage validated inside). Lazy: called ONLY on
// the first hover/open of a stage, never at page load.
// ============================================================================
import { getDealStagePreview } from "./deal-stage-preview";
import type { DealStagePreview } from "./deal-stage-preview-core";

export async function loadDealStagePreviewAction(stageKey: string): Promise<DealStagePreview | null> {
  return getDealStagePreview(stageKey);
}
