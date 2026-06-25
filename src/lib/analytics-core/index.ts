// ============================================================================
// ZONO — Analytics Core public surface (pure, client-safe). Canonical shared
// helpers + DTOs for the intelligence modules. ADDITIVE (Phase 19.5): new code
// adopts these; existing module-local helpers converge over time. The server-
// only permission helpers live in ./server-permissions (import directly).
// ============================================================================
export * from "./types";
export { clamp, round, avg, sum, sharePercent, pctChange, direction } from "./percentages";
export { formatCurrency, formatCurrencyCompact, formatInt, formatPercent, formatKpi } from "./currency";
export {
  PERIOD_DAYS, ROLLING_DAYS, PERIOD_LABELS, ROLLING_LABELS, startOfUtcDay, startOfUtcDayIso,
  daysAgoIso, rollingRange, scaleToPeriod, daysBetween, type Period, type RollingWindow,
} from "./date-ranges";
export { buildKpiCard, buildKpiCards, type KpiSpec } from "./kpi";
export { buildTrend, buildTrends, rankTrendsByMovement, type TrendSpec } from "./trends";
export { buildBenchmarks, type BenchmarkSpec } from "./benchmarks";
export {
  normalizeScore, scoreBand, BAND_LABELS, severityFromScore, SEVERITY_RANK, SEVERITY_LABELS,
  confidenceFromSample, CONFIDENCE_LABELS, weightedScore, type HealthBand,
} from "./scoring";
export {
  ROLE_RANK, RANK, roleRank, hasMinRole, isManagerPlus, isAgentPlus, toExecRole,
  type RoleKey, type ExecRoleLabel,
} from "./permissions";
