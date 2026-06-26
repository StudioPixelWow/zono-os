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
// ── Knowledge Engine (Phase 23) ──────────────────────────────────────────────
export * from "./knowledge-types";
export { BUILTIN_ARTICLES, BUILTIN_VERSION, builtinSlugs } from "./knowledge-docs";
export { tokenize, buildArticleDoc, buildIndex, chunkContent, type ArticleDoc } from "./knowledge-index";
export { searchKnowledge, canSeeArticle, type SearchContext } from "./knowledge-search";
export {
  RAG_FALLBACK, buildRagMessages, deterministicRagAnswer, ragSources, ragFollowups,
} from "./knowledge-rag";
// ── Diagnostics Engine (Phase 24, pure / client-safe) ────────────────────────
export type {
  DiagnosticStatus, FindingSeverity, IssueType, DiagnosticInput, DiagnosticFinding,
  DiagnosticResult, SupportPayload, DiagnosticSignals,
} from "./diagnostic-types";
export { runChecks, type CheckOutput } from "./diagnostic-checks";
export { buildSummary, buildExplanation, issueLabel } from "./diagnostic-explanations";
export { runZIDiagnostics, inferIssueType } from "./diagnostics";
