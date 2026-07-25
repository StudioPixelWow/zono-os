// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING COPILOT DRAFT ADAPTER (server). Phase 6.
// ----------------------------------------------------------------------------
// The production `CopilotDraft` — reply DRAFTS are produced by the EXISTING
// Communication Copilot (`generateReplySuggestions`), NOT a new reply engine. It
// maps the recent DM messages into the Copilot's channel-free view and returns a
// REVIEWABLE draft (requiresApproval: true) — it NEVER sends and NEVER auto-approves.
// The draft still flows through the approval-gated send pipeline before any provider
// write. No prompt/response text is persisted by this adapter.
// ============================================================================
import "server-only";
import { generateReplySuggestions } from "@/lib/comm-copilot";
import type { CopilotConversationView, ConversationClassification, SummaryArtifact, RecommendedActionArtifact, AnalysisMessage, Explainability } from "@/lib/comm-copilot/types";
import type { CopilotDraft } from "./ports";
import type { MetaPlatform } from "../types";

const explain = (confidence: number, reasoning: string[]): Explainability => ({ confidence, reasoning, evidence: [], evidenceMessageIds: [], deterministicSignals: ["meta_dm"], llmContribution: null });

function toView(platform: MetaPlatform, participantDisplay: string | null, recentText: readonly string[]): CopilotConversationView {
  const transcript: AnalysisMessage[] = recentText.map((t, i) => ({ seq: i, messageRef: `dm:${i}`, direction: "inbound", sentAt: "", text: t }));
  return { conversationRef: `${platform}:dm`, agentId: null, clientName: participantDisplay, waiting: transcript.length > 0, unread: transcript.length ? 1 : 0, messageCount: transcript.length, lastActivityAt: null, transcript, crmLinks: { lead: null, buyer: null, seller: null, journey: null, deal: null, property: null } };
}

export function createMessagingCopilot(): CopilotDraft {
  return {
    async draftReply(input) {
      const classification: ConversationClassification = "follow_up";
      const summary: SummaryArtifact = { stage: "messaging", intent: "reply", facts: [], objections: [], promises: [], nextAction: "reply", contributions: [], explain: explain(60, ["טיוטת תשובה להודעה פרטית"]) };
      const rec: RecommendedActionArtifact = { action: "follow_up", explain: explain(60, ["מומלץ להשיב"]) };
      const drafts = generateReplySuggestions(toView(input.platform, input.participantDisplay, input.recentText), classification, summary, rec, 60);
      const first = drafts[0];
      return first ? { body: first.body, requiresApproval: true as const } : null;
    },
  };
}
