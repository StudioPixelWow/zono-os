// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · public surface.
// One mode-driven assembler every reasoning surface uses (Ask ZONO, Broker Brain,
// Daily / Executive AI, recommendation explanations, entity cockpits). No screen
// builds its own AI context; one sensitivity policy; one provenance format.
// ============================================================================
export { assembleEntityContext, assembleEntityContextText } from "./assembler";
export type { ContextRequest } from "./assembler";
export { CONTEXT_MODES, modePolicy, sensitivityAllowed } from "./modes";
export type { ContextMode, ModePolicy } from "./modes";
export { renderContextText, hasContextSignal } from "./render";
export type {
  AssembledContext, CtxMemory, CtxTimeline, CtxRelationship, CtxRecommendation,
  ProvenanceItem, ContextDiagnostics,
} from "./render";
export { detectStaleMemory } from "./stale";
export type { CanonicalFact, StaleMemo, StaleResult } from "./stale";
export { groundEntityContext, groundGlobalContext, groundRecommendationContext, toGroundedSummary } from "./surface";
export type { GroundedContext, ProvenanceSummary } from "./surface";
export type { GroundedSummary } from "./grounding-summary";
export { canonicalFactsFor } from "./canonical-facts";
