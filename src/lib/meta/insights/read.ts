// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT SAFE READ MODELS. Phase 2.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. Aggregate metric values + time series ARE the
// product and are surfaced; but NEVER a token, app secret, raw Graph body, signed
// URL, lease token, or provider trace. Deterministic derivations only.
// ============================================================================
import type { InsightSnapshot, MetricKey } from "./domain";
import { latestByMetric, metricDelta } from "./metrics";

export interface MetricPointDTO { observedAt: string; value: number }
export interface MetricSeriesDTO { metricKey: string; points: readonly MetricPointDTO[]; latest: number; delta: number }
export interface InsightSummaryDTO { series: readonly MetricSeriesDTO[]; latest: Record<string, number> }

/** Build a safe, per-metric series summary from an append-only snapshot list. */
export function toInsightSummary(snapshots: readonly InsightSnapshot[]): InsightSummaryDTO {
  const byMetric = new Map<string, InsightSnapshot[]>();
  for (const s of snapshots) { const arr = byMetric.get(s.metricKey) ?? []; arr.push(s); byMetric.set(s.metricKey, arr); }
  const series: MetricSeriesDTO[] = [];
  for (const [metricKey, arr] of byMetric) {
    const points = [...arr].sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1)).map((s) => ({ observedAt: s.observedAt, value: s.value }));
    series.push({ metricKey, points, latest: points.at(-1)?.value ?? 0, delta: metricDelta(arr, metricKey as MetricKey) });
  }
  series.sort((a, b) => (a.metricKey < b.metricKey ? -1 : 1));
  return { series, latest: latestByMetric(snapshots) };
}
