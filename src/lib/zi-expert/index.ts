// ============================================================================
// ZI Expert™ — public client-safe barrel (Phase 22).
// Server-only modules (history.ts, actions.ts) are imported directly, NOT here.
// ============================================================================
export * from "./types";
export {
  ZI_KNOWLEDGE, knowledgeForModule, knowledgeForRoute, defaultKnowledge, defaultSuggestions,
} from "./knowledge";
export {
  detectModule, detectPageKey, buildZIContext, contextToPromptBlock, type ServerContextParts,
} from "./context";
export {
  ROLE_RANK, rankForRole, accessibleModules, accessibleModuleIds,
  canAccessModuleId, canAccessRoute, permissionScopeLine,
} from "./permissions";
export { ZI_SYSTEM_PROMPT, buildZiMessages } from "./prompts";
export {
  ziAiEnabled, deterministicAnswer, runZiCompletion, chunkForStream, streamText, type ZiCompletion,
} from "./providers";
export { answerZi, type ZiAnswer } from "./engine";
export {
  deriveTitle, searchConversations, sortConversations, groupConversationsByRecency, orderMessages,
  type ConversationGroup,
} from "./conversation";
