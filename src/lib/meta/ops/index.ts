// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · OPS barrel.
// Re-exports the pure orchestration metadata + cadence policy and the
// server-only fan-out. Server consumers (cron routes) may import from here;
// pure unit tests import ./groups and ./cadence directly to avoid pulling the
// server-only service graph.
// ============================================================================
export * from "./groups";
export * from "./cadence";
export * from "./orchestrator";
