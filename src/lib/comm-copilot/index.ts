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
export type * from "./types";
