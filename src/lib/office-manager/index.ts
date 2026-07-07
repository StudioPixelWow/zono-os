// ============================================================================
// 🏢 ZONO — Office AI Manager — barrel. PHASE 55.0.
// Manager command center composed from Executive OS, Calendar team availability,
// CRM ownership and Approval Bundles. Workload/capacity, follow-up compliance,
// risk-by-broker, delegation SUGGESTIONS (approval-gated, never auto-assigned).
// ============================================================================
export {
  OFFICE_MANAGER_VERSION, AVAIL_HE, WORKLOAD_HE, NO_AUTO_ASSIGN_NOTE,
  type AvailabilityState, type WorkloadLevel, type BrokerCard, type DelegationSuggestion,
  type OfficeBriefing, type FollowUpCompliance, type RiskByBroker, type VacationView, type OfficeManagerReport,
} from "./types";
export { composeOfficeManager } from "./compose";
export { getOfficeManager } from "./service";
export { runSelfCheck } from "./qa";
