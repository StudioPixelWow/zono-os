// ============================================================================
// 🧭 ZONO Unified Customer Journey™ & Lifecycle Intelligence — public surface. 28.5.
// ONE customer, multiple roles, one continuous lifecycle. Reuses the Buyer /
// Seller / Lead Digital Twins (summarised into members) + the framework
// buildTwinMemory. Chief of Staff, Decision and Mission engines consume the
// whole lifecycle. No new twin, no duplicated logic, no engine modified.
// ============================================================================
export { resolveCustomers, type IdentityEntry, type CustomerGroup } from "./identity";
export { deriveRoles, deriveCurrentStage, detectTransitions, buildStageHistory } from "./lifecycle";
export { computeCustomerHealth } from "./health";
export { buildCustomerJourney, type JourneyLinks } from "./journey";
export { getCustomerJourneys, type CustomerJourneysOverview } from "./service";
export { runSelfCheck, type CJSelfCheck, type CJCheck } from "./qa";
export {
  CUSTOMER_JOURNEY_VERSION, ROLE_HE, STAGE_HE,
  type MemberKind, type CustomerRole, type LifecycleStage, type MemberSummary,
  type StageTransition, type CustomerIdentity, type CustomerHealth, type CustomerJourney,
  type JourneyTimelineEntry,
} from "./types";
