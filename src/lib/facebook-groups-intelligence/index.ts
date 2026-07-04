// ============================================================================
// 📊 ZONO — Facebook Groups Intelligence™ & Performance Center — barrel. 33.4.
// The intelligence layer over the EXISTING group registry: structured insights +
// per-group recommendations + folder intelligence. Reuses the real scores from
// groups-service; property→group matching stays in groups-service. No new engine,
// no new tables, read-only, nothing executes.
// ============================================================================
export {
  buildGroupsIntelligence, analyzeGroup, buildFolderIntel,
  type GroupsIntelligence, type GroupIntel, type FolderIntel, type GroupInsight, type GroupRecommendation, type GroupStat, type InsightTag, type RecoAction,
} from "./intelligence";
export { runSelfCheck } from "./qa";
export { getGroupsIntelligence, recommendGroupsForProperty } from "./service";
