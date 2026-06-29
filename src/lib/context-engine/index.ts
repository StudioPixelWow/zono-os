// ============================================================================
// 🧩 Universal Context Engine™ — public surface. Phase 27.2.
// ----------------------------------------------------------------------------
// The ONLY sanctioned way future AI consumes ZONO context. Direct repository
// access by AI is prohibited — everything flows through getContext().
// No AI, no prompts, no reasoning, no execution in this phase.
// ============================================================================
export { getContext, getContextExplain } from "./service";
export { buildContextPackage, buildCacheKey } from "./engine";
export { SUPPORTED_CONTEXT_TYPES } from "./builders";
export { BLOCK_PRIORITY, priorityFor } from "./priorities";
export { SIZE_BUDGET } from "./compression";
export { validateContextPackage, runSelfCheck } from "./qa";
export { CONTEXT_ENGINE_VERSION } from "./types";
export type {
  ContextType, ContextSize, ContextRequest, ContextPackage, ContextBlock,
  ContextIdentity, ContextPermissions, ContextExplain, ContextSources, Evidence,
} from "./types";
