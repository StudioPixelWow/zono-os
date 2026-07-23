// ============================================================================
// 🤖 ZONO — Copilot PIPELINE (pure). Phase 1.
// ----------------------------------------------------------------------------
// analyze → classify → summarize, over the channel-free view. Deterministic and
// transport-agnostic: identical view → identical result. No I/O, so the whole
// pipeline is unit-testable and the same across every transport.
// ============================================================================
import { analyzeConversation, type ConversationAnalysis } from "./analyze";
import { classifyConversation, type ClassifyOptions } from "./classify";
import { summarizeConversation } from "./summarize";
import type { CopilotConversationView, ClassificationArtifact, SummaryArtifact } from "./types";

export interface CopilotPipelineResult {
  analysis: ConversationAnalysis;
  classification: ClassificationArtifact;
  summary: SummaryArtifact;
}

export function runCopilotPipeline(view: CopilotConversationView, nowIso: string, opts: ClassifyOptions = {}): CopilotPipelineResult {
  const analysis = analyzeConversation(view, nowIso);
  const classification = classifyConversation(analysis, opts);
  const summary = summarizeConversation(analysis, classification.classification);
  return { analysis, classification, summary };
}
