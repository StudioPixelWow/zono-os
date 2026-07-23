// ============================================================================
// 🤖 ZONO — Copilot PIPELINE (pure). Phase 1 + 2.
// ----------------------------------------------------------------------------
// analyze → classify → summarize → sentiment → attention → recommend, over the
// channel-free view. Deterministic and transport-agnostic: identical view →
// identical result. No I/O. Every artifact carries explainability.
// ============================================================================
import { analyzeConversation, type ConversationAnalysis } from "./analyze";
import { classifyConversation, type ClassifyOptions } from "./classify";
import { summarizeConversation } from "./summarize";
import { deriveSentiment } from "./sentiment";
import { detectAttention } from "./detect";
import { recommendAction } from "./recommend";
import type { CopilotConversationView, ClassificationArtifact, SummaryArtifact, SentimentArtifact, RecommendedActionArtifact, AttentionFlag } from "./types";

export interface CopilotPipelineResult {
  analysis: ConversationAnalysis;
  classification: ClassificationArtifact;
  summary: SummaryArtifact;
  sentiment: SentimentArtifact;
  attention: AttentionFlag[];
  recommendedAction: RecommendedActionArtifact;
}

export function runCopilotPipeline(view: CopilotConversationView, nowIso: string, opts: ClassifyOptions = {}): CopilotPipelineResult {
  const analysis = analyzeConversation(view, nowIso);
  const classification = classifyConversation(analysis, opts);
  const summary = summarizeConversation(analysis, classification.classification);
  const sentiment = deriveSentiment(analysis);
  const attention = detectAttention(analysis);
  const recommendedAction = recommendAction(analysis, classification.classification);
  return { analysis, classification, summary, sentiment, attention, recommendedAction };
}
