// ============================================================================
// ZONO — Intelligence Action Center™ data (server-only). Presentation only.
// ----------------------------------------------------------------------------
// Organizes EXISTING intelligence into work. It composes two existing reads:
// the recommendation command center (the existing AI Coach output) and the
// dashboard projection (opportunities + offices + feed). Nothing is computed —
// grouping is pure bucketing of existing rows by their existing urgency/status.
// Never generates advice.
// ============================================================================
import "server-only";
import { getRecommendationCommandCenter } from "@/lib/recommendations/service";
import { getIntelligenceDashboard } from "./dashboard";
import type { ActionCenterDTO } from "./action-center-shared";

// Public API preserved: type + pure bucketing helper now live in the client-safe
// shared module (no "server-only"); re-exported here so existing imports work.
export type { ActionCenterDTO, RecBucket } from "./action-center-shared";
export { bucketRecommendations } from "./action-center-shared";

export async function getActionCenter(): Promise<ActionCenterDTO> {
  const [recommendations, dashboard] = await Promise.all([
    getRecommendationCommandCenter().catch((e) => { console.error("[action-center] recommendations failed:", e); return null; }),
    getIntelligenceDashboard(),
  ]);
  return { recommendations, dashboard };
}
