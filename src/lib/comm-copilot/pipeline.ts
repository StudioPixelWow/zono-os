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
import { generateReplySuggestions } from "./reply";
import { detectMilestones, buildTimelineModel } from "./timeline";
import { extractMemory } from "./memory-extract";
import type { CopilotConversationView, ClassificationArtifact, SummaryArtifact, SentimentArtifact, RecommendedActionArtifact, AttentionFlag, ReplySuggestionArtifact, MilestoneArtifact, TimelineModel } from "./types";
import type { PartialMemory } from "./memory-types";

export interface CopilotPipelineResult {
  analysis: ConversationAnalysis;
  classification: ClassificationArtifact;
  summary: SummaryArtifact;
  sentiment: SentimentArtifact;
  attention: AttentionFlag[];
  recommendedAction: RecommendedActionArtifact;
  replies: ReplySuggestionArtifact[];     // Phase 3 — approval-gated proposals
  milestones: MilestoneArtifact[];        // Phase 3 — detected milestones
  timeline: TimelineModel;                // Phase 3 — visualization model
  memoryExtract: PartialMemory;           // Phase 4 — deterministic memory extraction
}

export function runCopilotPipeline(view: CopilotConversationView, nowIso: string, opts: ClassifyOptions = {}): CopilotPipelineResult {
  const analysis = analyzeConversation(view, nowIso);
  const classification = classifyConversation(analysis, opts);
  const summary = summarizeConversation(analysis, classification.classification);
  const sentiment = deriveSentiment(analysis);
  const attention = detectAttention(analysis);
  const recommendedAction = recommendAction(analysis, classification.classification);
  const replies = generateReplySuggestions(view, classification.classification, summary, recommendedAction, classification.explain.confidence);
  const milestones = detectMilestones(analysis);
  const timeline = buildTimelineModel(milestones);
  const memoryExtract = extractMemory(analysis);
  return { analysis, classification, summary, sentiment, attention, recommendedAction, replies, milestones, timeline, memoryExtract };
}
