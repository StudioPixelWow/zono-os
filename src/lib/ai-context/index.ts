// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · public surface.
// One assembler every reasoning surface uses (Ask ZONO, Broker Brain, Daily /
// Executive AI, recommendation explanations, entity cockpits). No screen builds
// its own AI context.
// ============================================================================
export { assembleEntityContext, assembleEntityContextText } from "./assembler";
export type { AssembleOptions } from "./assembler";
export { renderContextText, hasContextSignal } from "./render";
export type { AssembledContext, CtxMemory, CtxTimeline, CtxRelationship, CtxRecommendation } from "./render";
