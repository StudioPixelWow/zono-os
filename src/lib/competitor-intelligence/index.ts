// ============================================================================
// ZONO — Competitor Intelligence™ public surface (pure layers only). The
// server-only repository/engine/actions import directly where needed.
// All inferences come from PUBLIC market data; share figures are estimates.
// ============================================================================
export * from "./types";
export { classifyListing, normalizeCompetitorName, confidenceLabel } from "./classifier";
export { computeCompetitorAnalytics, priceSegment, pctChange, pct, clamp, type AnalyticsInput } from "./analytics";
export { calculateCompetitorMarketShare, ourMarketShare, SHARE_LABEL, type MarketShareInput } from "./market-share";
export { scoreAreaTrend, rankAreaTrends, type AreaTrendInput } from "./trends";
export { buildCompetitorAlertCandidates, dedupAlerts, alertDedupKey, type AlertCandidate, type BuildAlertsInput } from "./alerts";
