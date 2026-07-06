// ============================================================================
// 📣 ZONO — Daily Facebook Groups Publishing Assistant — barrel. PHASE 49.0.
// A compliant ASSISTED daily checklist over the EXISTING distribution queue:
// ZONO prepares today's due Facebook-group posts (grouped by property); the broker
// publishes BY HAND and records the result. No new tables, no auto-post, no
// scraping, no browser automation. Reuses distribution posts/groups + manual publish.
// ============================================================================
export {
  MAX_GROUPS_PER_PROPERTY, ACTIONABLE_STATUSES, ASSISTANT_NOTE,
  type PublishPostCard, type PropertyPublishingGroup, type PublishFolder,
  type DailyGroupsPublishingPlan, type PublishInputRow,
} from "./types";
export { assembleDailyGroupsPublishing } from "./assemble";
export { getDailyGroupsPublishingPlan } from "./service";
export { runSelfCheck } from "./qa";
