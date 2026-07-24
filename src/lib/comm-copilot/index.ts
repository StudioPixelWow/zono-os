// ============================================================================
// 🤖 ZONO — AI Communication Copilot (Batch 6.7) · public surface (server-only).
// ----------------------------------------------------------------------------
// Phase 0 scaffolding: the transport-agnostic canonical read + the cross-cutting
// Explainability and Feedback primitives. Analyzers (classification, summary,
// sentiment, missing-response, NBA, timeline, memory) land in later phases and
// plug in here. The Copilot reads canonical conversations only, never modifies
// the Communication OS, and never sends.
// ============================================================================
import "server-only";

export { loadConversationView } from "./read";
export { toAnalysisView } from "./normalize";
export { buildExplain, isExplained } from "./explain";
export { computeFeedbackMetrics, FEEDBACK_PURPOSE } from "./feedback";
// Phase 1 — conversation understanding (deterministic, transport-agnostic).
export { analyzeConversation, type ConversationAnalysis } from "./analyze";
export { classifyConversation } from "./classify";
export { summarizeConversation } from "./summarize";
export { runCopilotPipeline, type CopilotPipelineResult } from "./pipeline";
export { deterministicHash, shouldRegenerate, buildInsightRow, buildSummaryRow, hashExtraOf } from "./record";
export { conversationRefToUuid } from "./ids";
export { generateConversationInsight, type FreshnessReason } from "./service";
// Phase 2 — sentiment, missing-response detection, next-best-action, feed.
export { deriveSentiment } from "./sentiment";
export { detectAttention } from "./detect";
export { recommendAction } from "./recommend";
export { getAttentionFeed, type AttentionFeedItem } from "./feed";
// Phase 3 — reply suggestions + timeline intelligence.
export { generateReplySuggestions } from "./reply";
export { detectMilestones, buildTimelineModel } from "./timeline";
export { replyFreshnessHash, timelineFreshnessHash, buildReplyRows, buildMilestoneRows } from "./record";
// Phase 4 — deterministic AI memory.
export { extractMemory } from "./memory-extract";
export { mergeMemory, type MergeResult } from "./memory-merge";
export { buildClientMemoryRow, buildAiMemoryInputs, memoryEntityId } from "./memory-record";
export { memoryFreshnessHash } from "./record";
export { emptyMemory } from "./memory-types";
export type * from "./memory-types";
export type * from "./types";
