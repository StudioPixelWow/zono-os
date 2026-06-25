// ============================================================================
// ZONO — Analytics Core: trend + benchmark builders (pure, canonical).
// ============================================================================
import { pctChange, direction } from "./percentages";
import type { TrendValue } from "./types";

export interface TrendSpec { metric: string; label: string; current: number; previous: number }

export function buildTrend(spec: TrendSpec): TrendValue {
  const deltaPercent = pctChange(spec.current, spec.previous);
  return { metric: spec.metric, label: spec.label, current: spec.current, previous: spec.previous, deltaPercent, direction: direction(deltaPercent) };
}

export function buildTrends(specs: TrendSpec[]): TrendValue[] {
  return specs.map(buildTrend);
}

/** Rank trends by absolute movement (biggest movers first). */
export function rankTrendsByMovement(trends: TrendValue[]): TrendValue[] {
  return [...trends].sort((a, b) => Math.abs(b.deltaPercent ?? 0) - Math.abs(a.deltaPercent ?? 0));
}
