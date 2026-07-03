// ============================================================================
// 🗂️ ZONO — Property Marketing Log — barrel. 33.1.x.
// The property's marketing file — one chronological log of every marketing action
// (Facebook-group campaigns/posts, comments/leads, Creative Studio assets),
// aggregated from EXISTING sources. Read-only; no new tables; nothing executes.
// ============================================================================
export { buildMarketingLog, groupByDay, type MarketingEvent, type MarketingEventKind, type MarketingLog, type MarketingLogSummary } from "./timeline";
export { runSelfCheck } from "./qa";
export { getPropertyMarketingLog } from "./service";
