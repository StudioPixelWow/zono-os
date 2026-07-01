// ============================================================================
// 🧠 ZONO AI Chief of Staff™ — public surface. Phase 27.6.
// The orchestration layer over every ZONO engine. Observes, prioritizes,
// connects and recommends — never a source of truth, never auto-executes.
// Reuses Discovery / Knowledge Graph / Decision Engine / Mission Engine /
// Valuation / MAI / Territory / Competitive / Broker / Office Intelligence
// (read-only). This is the foundation for Ask ZONO, Voice/WhatsApp/Email
// assistants and future AI agents — nothing bypasses it.
// ============================================================================
export { getChiefOfStaff, buildGlobalContext, type GlobalContextBundle } from "./service";
export { computeOrganizationScore, computeDashboard, clamp } from "./score";
export {
  crossModuleInsights, buildExecutiveRecommendations, buildInterventions, buildBusinessMemory,
  type ReasoningInput, type MissionLite, type MemoryInput,
  type CityPriority, type CityRisk, type CityOpportunity, type CompetitorSignal,
} from "./reasoning";
export { runSelfCheck, type COSSelfCheck, type COSCheck } from "./qa";
export { CHIEF_OF_STAFF_VERSION } from "./types";
export type {
  Impact, OrgSignals, OrgMissionSignals, OrgMarketSignals,
  ScoreDim, OrganizationScore, HealthScore, ExecutiveDashboard,
  RecKind, ExecutiveRecommendation, CrossModuleInsight, BusinessMemory,
  ExecutiveBriefing, CityContext, GlobalContext, ExecutiveRecommendations, ChiefOfStaffReport,
} from "./types";
