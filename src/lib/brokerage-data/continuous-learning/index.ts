// ============================================================================
// 🔄 Continuous Brokerage Intelligence™ — public surface. 26.4.16.
// Every known city becomes a living entity that improves itself when new data
// appears — differential refresh only, priority-scheduled, gradual confidence
// evolution. Reuses Research Jobs / Research Agent / City Discovery / KB /
// Census / Verification. No new discovery/agent/prompt, no schema rewrite.
// ============================================================================
export { getCityLearningProfile } from "./profile";
export { buildSchedulerPlan, runContinuousLearningTick, scanKnownCities } from "./scheduler";
export { enqueueCityRefresh, enqueueCityRefreshFireAndForget, evolveCityOfficeConfidence } from "./refresh";
export { classifyCityPriority, rankPriorities, type CitySignals } from "./priority";
export { freshnessScore, isStale, learningHealth, evolveConfidence, daysSince } from "./freshness";
export { runSelfCheck, type CLSelfCheck, type CLCheck } from "./qa";
export {
  CONTINUOUS_LEARNING_VERSION, PRIORITY_LABEL, REASON_HE,
  type RefreshReason, type PriorityTier, type CityPriority, type SchedulerPlan,
  type CityLearningProfile, type ContinuousTickResult,
} from "./types";
