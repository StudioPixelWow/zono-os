// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT METRIC MODEL (PURE). Phase 2.
// ----------------------------------------------------------------------------
// The canonical metric-key allow-list + safe validation/derivation used above the
// provider. The raw-Graph-metric → canonical-key mapping lives inside
// provider/graph/insights.ts (Graph specifics stay sealed); this module only
// knows the canonical keys and derives safe, secret-free rollups. Pure.
// ============================================================================
import type { MetricKey, InsightSnapshot } from "./domain";

const KNOWN: ReadonlySet<string> = new Set<MetricKey>(["impressions", "reach", "engagement", "likes", "comments", "shares", "saves", "video_views", "reactions", "clicks", "followers", "profile_views"]);

/** Is a string a known canonical metric key? */
export function isKnownMetric(key: string): key is MetricKey { return KNOWN.has(key); }

/** Keep only known, finite, non-negative snapshots (defensive normalization). */
export function sanitizeSnapshots(snaps: readonly InsightSnapshot[]): InsightSnapshot[] {
  return snaps.filter((s) => isKnownMetric(s.metricKey) && Number.isFinite(s.value) && s.value >= 0);
}

/** The latest value per metric key from a series (deterministic). */
export function latestByMetric(series: readonly InsightSnapshot[]): Record<string, number> {
  const out: Record<string, number> = {};
  const seen: Record<string, string> = {};
  for (const s of series) { if (!seen[s.metricKey] || s.observedAt > seen[s.metricKey]) { seen[s.metricKey] = s.observedAt; out[s.metricKey] = s.value; } }
  return out;
}

/** Delta between the two most recent observations of a metric (0 if <2 points). */
export function metricDelta(series: readonly InsightSnapshot[], metricKey: MetricKey): number {
  const pts = series.filter((s) => s.metricKey === metricKey).sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
  if (pts.length < 2) return 0;
  return pts[pts.length - 1].value - pts[pts.length - 2].value;
}
