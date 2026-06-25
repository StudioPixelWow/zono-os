// ============================================================================
// ZONO — Analytics Core: benchmarks (pure, canonical). A benchmark is a trend
// of a metric vs a baseline period; reuses the trend builder.
// ============================================================================
import { buildTrends, type TrendSpec } from "./trends";
import type { TrendValue } from "./types";

export type BenchmarkSpec = TrendSpec & { baselineLabel?: string };

export function buildBenchmarks(specs: BenchmarkSpec[]): TrendValue[] {
  return buildTrends(specs);
}
