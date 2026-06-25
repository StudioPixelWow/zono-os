// ============================================================================
// ZONO — Office Intelligence™ public surface (pure layers only). The server-only
// engine/repository/permissions are imported directly where needed.
// AI summarizes these analytics; deterministic engines remain source of truth.
// ============================================================================
export * from "./types";
export { pctChange, clamp, avg, sum } from "./analytics";
export { buildKpiCards } from "./kpis";
export { computeLeaderboardScore, scoreAgent, responseRateScore } from "./scoring";
export { rankLeaderboard } from "./leaderboards";
export { forecastOffice, type ForecastInput } from "./forecasting";
export { buildBenchmarks } from "./benchmarks";
export { deriveCoachingItems } from "./coaching";
export { detectOfficeRisks, type RiskInput } from "./risk";
export { computeGoalProgress, type GoalRow } from "./goals";
export { toOfficeMapPoints, computeMarketShareEstimates, type MarketShareInput } from "./map";
