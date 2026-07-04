// ============================================================================
// 🏆 ZONO — Local Market Domination™ Platform — barrel. 34.0.
// Turns every area into a managed market: Domination Score + territory actions +
// phased plans + dashboard, by AGGREGATING existing engine outputs (Market
// Intelligence + Facebook Groups Intelligence). No new scoring engine, no new
// tables, read-only, nothing executes.
// ============================================================================
export {
  scoreArea, detectTerritoryActions, buildPlans, buildDomination,
  type AreaSignal, type AreaDomination, type DominationBand, type TerritoryAction, type ActionKind,
  type DominationPlan, type PlanTask, type DominationDashboard, type DominationBreakdown,
} from "./domination";
export { runSelfCheck } from "./qa";
export { getMarketDomination } from "./service";
