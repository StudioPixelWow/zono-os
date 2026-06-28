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
import { getRecommendationCommandCenter, type RecommendationCommandCenter, type RecommendationView } from "@/lib/recommendations/service";
import { getIntelligenceDashboard, type IntelligenceDashboardDTO } from "./dashboard";

export interface ActionCenterDTO {
  recommendations: RecommendationCommandCenter | null;
  dashboard: IntelligenceDashboardDTO;
}

export async function getActionCenter(): Promise<ActionCenterDTO> {
  const [recommendations, dashboard] = await Promise.all([
    getRecommendationCommandCenter().catch((e) => { console.error("[action-center] recommendations failed:", e); return null; }),
    getIntelligenceDashboard(),
  ]);
  return { recommendations, dashboard };
}

// ── Pure bucketing helpers (no new logic — grouping existing values) ─────────
export type RecBucket = "today" | "week" | "monitor" | "completed";
export function bucketRecommendations(rc: RecommendationCommandCenter | null): Record<RecBucket, RecommendationView[]> {
  const out: Record<RecBucket, RecommendationView[]> = { today: [], week: [], monitor: [], completed: [] };
  if (!rc) return out;
  out.completed = rc.recentlyConverted ?? [];
  for (const r of rc.top ?? []) {
    if (r.status === "converted") continue;
    if (r.urgency_score >= 70) out.today.push(r);
    else if (r.urgency_score >= 40) out.week.push(r);
    else out.monitor.push(r);
  }
  return out;
}
