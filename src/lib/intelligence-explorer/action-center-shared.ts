// ============================================================================
// ZONO — Intelligence Action Center shared types + PURE bucketing helper.
// Client-safe: NO "server-only" import. Only type-only imports (erased at build)
// from server modules. This lets ActionCenterView import bucketRecommendations
// and the DTO types without pulling the server-only data layer (action-center.ts)
// into the client bundle. Nothing is computed — grouping of existing rows only.
// ============================================================================
import type { RecommendationCommandCenter, RecommendationView } from "@/lib/recommendations/service";
import type { IntelligenceDashboardDTO } from "./dashboard-shared";

export interface ActionCenterDTO {
  recommendations: RecommendationCommandCenter | null;
  dashboard: IntelligenceDashboardDTO;
}

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
