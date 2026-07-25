// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT DOMAIN TYPES (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Canonical, secret-free shapes for the append-only insight time series. A
// snapshot is a metric value at an observed instant; the series is never mutated
// in place. Provider-neutral canonical metric keys only — raw Graph metric names
// live inside provider/graph/insights.ts and never escape.
// ============================================================================

export type InsightPeriod = "lifetime" | "day" | "week" | "days_28";
export type InsightSubjectKind = "object" | "account";

/** The canonical, provider-neutral metric keys. */
export type MetricKey =
  | "impressions" | "reach" | "engagement" | "likes" | "comments" | "shares"
  | "saves" | "video_views" | "reactions" | "clicks" | "followers" | "profile_views";

export const OBJECT_METRICS: readonly MetricKey[] = ["impressions", "reach", "engagement", "likes", "comments", "shares", "saves", "video_views", "reactions", "clicks"];
export const ACCOUNT_METRICS: readonly MetricKey[] = ["impressions", "reach", "followers", "profile_views"];

export interface InsightSnapshot {
  metricKey: MetricKey;
  period: InsightPeriod;
  value: number;
  observedAt: string;
}
