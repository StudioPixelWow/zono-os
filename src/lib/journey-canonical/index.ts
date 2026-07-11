// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.1 · Canonical Journey Spine (barrel).
//
// THE one Journey vocabulary. Persisted by the EXISTING `journeys` +
// `journey_events` tables; consumed by the EXISTING kernel journey-subscriber
// (wired in 5.2), the Journey Center and the entity cockpits (5.4 / 5.5).
// Pure + client-safe: no server imports, no I/O.
// ============================================================================
export type {
  CanonicalStage, JourneyEntityType, JourneyStatus, JourneyType,
  StageKind, StageMachine, StageTransition, TransitionKind, TransitionResult,
} from "./types";

export {
  BUYER_MACHINE, DEAL_MACHINE, JOURNEY_TYPES, LEAD_MACHINE, MACHINES,
  PROPERTY_MACHINE, SELLER_MACHINE,
  initialStage, isJourneyType, isValidStage, ladder, machineFor,
  stageDef, stageLabel, stageProgress,
} from "./machines";

export {
  buildTransition, isNoop, statusForKind, timestampFieldForKind, validateTransition,
} from "./transitions";

export type { JourneyLegacySource, LegacyStageMapping } from "./legacy-map";
export {
  JOURNEY_DEPRECATION_REGISTRY, LEGACY_BUYER_STAGE_MAP, LEGACY_DEAL_STAGE_MAP,
  LEGACY_PROPERTY_STAGE_MAP, LEGACY_SELLER_STAGE_MAP, journeyRegistryCounts,
  legacyMapsAreSound, mapLegacyStage, resolveLegacyPropertyClosed,
} from "./legacy-map";
