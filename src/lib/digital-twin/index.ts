// ============================================================================
// 👤 ZONO Digital Twin Framework™ — public surface. 28.1.
// ONE reusable, entity-agnostic Digital Twin model + universal API. Buyer is the
// first implementation (./buyers). Every future entity (seller, lead, broker,
// office, property, project, developer, campaign, …) reuses these exact APIs.
// Composes Truth / Relationship / Organizational Memory / Decision / Mission /
// Chief of Staff read-only. No duplicated logic; no protected engine modified.
// ============================================================================
export {
  createDigitalTwin, updateTwin, learnFromActivity, buildTwinMemory, buildTwinHealth,
  computeConfidence, buildTwinTruth, buildTwinRelationships, attachOrgMemory,
  rankTwinDecisions, rankTwinMissions, clamp, type CreateTwinInput, type HealthInputs,
} from "./core";
export { runSelfCheck, type DTSelfCheck, type DTCheck } from "./qa";
export { DIGITAL_TWIN_VERSION } from "./types";
export type {
  TwinEntityType, TwinIdentity, ActivityKind, TwinActivity, TwinMemory, TwinHealth,
  TwinTruthSummary, TwinRelationshipSummary, TwinDecisionSignal, TwinMissionSignal,
  TwinLearning, DigitalTwin,
} from "./types";
