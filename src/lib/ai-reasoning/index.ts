// ============================================================================
// 🧠 AI Reasoning Gateway™ — public surface. Phase 27.3.
// The ONLY way to obtain an AI answer in ZONO. The model receives only a
// sanitized ContextPackage from the Universal Context Engine — never the DB.
// ============================================================================
export { answerWithZonoAI } from "./service";
export { runReasoningGateway, openAIProvider, selectProvider } from "./gateway";
export { runSelfCheck } from "./qa";
export { AI_REASONING_VERSION } from "./types";
export type {
  AIMode, AILanguage, AIReasoningStatus, AIReasoningRequest, AIReasoningResponse,
  AIEvidence, AIProvider, AIProviderCompletion,
} from "./types";
