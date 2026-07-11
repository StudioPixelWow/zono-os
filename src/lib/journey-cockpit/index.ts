// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5 · Cockpit Journey (barrel).
//
// The ONE journey model every entity cockpit (Buyer / Seller / Lead / Property /
// Deal) renders, assembled from the canonical spine. Pure + client-safe: no server
// imports, no I/O — the service layer (5.5C) does the reading and calls in here.
// ============================================================================
export type {
  CockpitBlocker, CockpitCommand, CockpitEntityType, CockpitFacts,
  CockpitJourney, CockpitLink, CockpitStage, CockpitTransition,
} from "./types";

export type {
  AssembleCanonicalInput, AssembleFallbackInput, CockpitEventRow,
} from "./assemble";

export {
  allowedCommandsFor, assembleCockpitJourney, buildBlockers, buildHistory, buildLadder,
  fallbackCockpitJourney, HISTORY_LIMIT, isBlocked, lastLadderStage, nextMilestoneFor,
  NO_FACTS, progressFor, STALL_DAYS, transitionSource,
} from "./assemble";
