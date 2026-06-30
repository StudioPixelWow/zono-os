// ============================================================================
// 🧠 ZONO Reasoning Engine™ — public surface. Phase 27.3.
// ----------------------------------------------------------------------------
// The official intelligence-orchestration layer between ZONO Knowledge (the
// Universal Context Engine) and the LLM. Every future AI capability — Ask ZONO,
// AI Coach, Buyer/Seller/Manager AI, Deal/Communication/Calendar assistants and
// Mission Control — must obtain answers through runReasoningEngine(). No feature
// may bypass it; the LLM never becomes a source of truth.
// ============================================================================
export { runReasoningEngine } from "./service";
export type { ReasoningDeps } from "./service";
export { classifyIntent } from "./intent";
export { routeIntent } from "./routing";
export { buildEvidenceGraph, graphHasEvidence } from "./evidence-graph";
export { REASONING_MODES, modeToAIMode, modeInstruction, inferMode } from "./modes";
export { runSelfCheck } from "./qa";
export type { ReasoningSelfCheck, ReasoningCheck } from "./qa";
export { REASONING_ENGINE_VERSION } from "./types";
export type {
  IntentFamily, IntentResult, ReasoningRoute, RoutingDecision,
  ReasoningMode, ReasoningDepth, ReasoningRequest, ReasoningStatus, ReasoningResponse,
  EvidenceRef, EvidenceNode, EvidenceGraph,
} from "./types";
