// ============================================================================
// ZONO — latency metrics (pure, deterministic). In-memory histograms with
// percentile (p50/p95/p99) summaries for latency / DB / queue / provider / AI /
// journey throughput. No external dependency.
// ============================================================================
import type { LatencySummary } from "../types";

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx]!;
}

export function summarize(metric: string, samples: number[]): LatencySummary {
  if (samples.length === 0) return { metric, count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    metric, count: sorted.length, min: sorted[0]!, max: sorted[sorted.length - 1]!,
    avg: Math.round((sum / sorted.length) * 100) / 100,
    p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99),
  };
}

/** Bounded in-memory metrics registry (ring buffer per metric). */
export class MetricsRegistry {
  private store = new Map<string, number[]>();
  constructor(private cap = 1000) {}
  record(metric: string, value: number): void {
    const arr = this.store.get(metric) ?? [];
    arr.push(value);
    if (arr.length > this.cap) arr.shift();
    this.store.set(metric, arr);
  }
  summary(metric: string): LatencySummary { return summarize(metric, this.store.get(metric) ?? []); }
  all(): LatencySummary[] { return [...this.store.keys()].map((m) => this.summary(m)).sort((a, b) => b.count - a.count); }
  reset(): void { this.store.clear(); }
}

/** Process-wide default registry. */
export const metrics = new MetricsRegistry();
