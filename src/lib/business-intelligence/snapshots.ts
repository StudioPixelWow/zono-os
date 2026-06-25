// ============================================================================
// ZONO — Snapshot payload builder (pure). Assembles the canonical daily
// executive snapshot from the composed dashboard. Deterministic.
// ============================================================================
import type { BiSnapshotPayload, ExecutiveDashboard } from "./types";

export function buildSnapshotPayload(d: ExecutiveDashboard): BiSnapshotPayload {
  return {
    kpis: d.kpis.month,          // canonical period for the daily snapshot
    forecast: d.forecast,
    pipeline: d.pipeline,
    health: d.health,
    roi: d.roi,
    revenue: d.revenue,
    risk: d.risks,
    benchmarks: d.benchmarks,
  };
}
