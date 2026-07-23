// ============================================================================
// 🤖 ZONO — Copilot SENTIMENT (pure). Phase 2.
// ----------------------------------------------------------------------------
// Maps the REUSED comm-intelligence sentiment (detectSentiment, already run in
// analyze) into the Copilot's 5 buckets, with confidence + explainability.
// "high_intent" is derived from a ready_to_close intent (excited/urgent tone
// reinforce it). No new sentiment engine.
// ============================================================================
import { buildExplain } from "./explain";
import type { CopilotSentiment, SentimentArtifact } from "./types";
import type { ConversationAnalysis } from "./analyze";

const MAP: Record<string, CopilotSentiment> = {
  positive: "positive", excited: "high_intent", urgent: "high_intent",
  neutral: "neutral", cold: "hesitant", negative: "frustrated", frustrated: "frustrated",
};

export function deriveSentiment(a: ConversationAnalysis): SentimentArtifact {
  const hasReadyToClose = a.intents.some((i) => i.intent === "ready_to_close");
  const base = MAP[a.sentiment.sentiment] ?? "neutral";
  const sentiment: CopilotSentiment = hasReadyToClose ? "high_intent" : base;
  const evidence = hasReadyToClose ? (a.intentEvidence["ready_to_close"] ?? []) : (a.transcript.filter((m) => m.direction === "inbound").slice(-1).map((m) => m.messageRef));
  const reasoning = [
    hasReadyToClose ? "High intent — client signalled readiness to close" : `Tone detected: ${a.sentiment.sentiment}`,
  ];
  return {
    sentiment,
    explain: buildExplain({
      confidence: a.sentiment.score,
      reasoning, evidence: reasoning, evidenceMessageIds: evidence,
      deterministicSignals: [hasReadyToClose ? "intent:ready_to_close" : `sentiment:${a.sentiment.sentiment}`],
      llmContribution: null,
    }),
  };
}
