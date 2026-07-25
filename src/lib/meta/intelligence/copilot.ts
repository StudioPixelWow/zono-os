// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COPILOT DRAFT ADAPTER (server). Phase 4.
// ----------------------------------------------------------------------------
// The production `CopilotGateway` — reply DRAFTS are produced by the EXISTING
// Communication Copilot (`generateReplySuggestions`), NOT a new reply engine. It
// maps the bounded, safe Meta context into the Copilot's channel-free view and
// returns a REVIEWABLE draft reference (requiresApproval: true) — it NEVER sends,
// never calls Meta, and never persists the draft text into the intelligence
// tables (the text stays in the Copilot's reviewable-draft domain; only a ref is
// referenced by a suggestion). `renderDraftBody` re-derives the text on demand
// for an approval preview.
// ============================================================================
import "server-only";
import { generateReplySuggestions } from "@/lib/comm-copilot";
import type { CopilotConversationView, ConversationClassification, SummaryArtifact, RecommendedActionArtifact, AnalysisMessage, Explainability, ReplySuggestionArtifact } from "@/lib/comm-copilot/types";
import type { CopilotGateway, CopilotDraftInput } from "./ports";

const explain = (confidence: number, reasoning: string[]): Explainability => ({ confidence, reasoning, evidence: [], evidenceMessageIds: [], deterministicSignals: ["meta_engagement"], llmContribution: null });

function toView(input: CopilotDraftInput): CopilotConversationView {
  const transcript: AnalysisMessage[] = input.context.map((c, i) => ({ seq: i, messageRef: `${input.subjectRef}:${i}`, direction: c.fromPage ? "outbound" : "inbound", sentAt: c.at ?? "", text: c.text }));
  const lastInbound = [...transcript].reverse().find((m) => m.direction === "inbound");
  return {
    conversationRef: `${input.platform}:${input.subjectRef}`, agentId: null, clientName: input.participantDisplay,
    waiting: !!lastInbound, unread: lastInbound ? 1 : 0, messageCount: transcript.length, lastActivityAt: transcript.at(-1)?.sentAt ?? null,
    transcript, crmLinks: { lead: null, buyer: null, seller: null, journey: null, deal: null, property: null },
  };
}
function artifacts(input: CopilotDraftInput): { classification: ConversationClassification; summary: SummaryArtifact; rec: RecommendedActionArtifact } {
  const classification: ConversationClassification = "follow_up";
  const summary: SummaryArtifact = { stage: "engagement", intent: "reply", facts: input.insightHint ? [input.insightHint] : [], objections: [], promises: [], nextAction: "reply", contributions: [], explain: explain(60, ["טיוטת תשובה לפנייה ציבורית"]) };
  const rec: RecommendedActionArtifact = { action: "follow_up", explain: explain(60, ["מומלץ להשיב לפנייה"]) };
  return { classification, summary, rec };
}
/** Generate the reviewable reply artifacts via the existing Copilot (no send). */
function generate(input: CopilotDraftInput): ReplySuggestionArtifact[] {
  const { classification, summary, rec } = artifacts(input);
  return generateReplySuggestions(toView(input), classification, summary, rec, 60);
}
/** A deterministic, content-free reference to the reviewable draft. */
export const draftRefFor = (input: CopilotDraftInput, tone: string) => `copilot:${input.platform}:${input.subjectRef}:${tone}`;

export function createCopilotGateway(): CopilotGateway {
  return {
    async draftReply(input: CopilotDraftInput) {
      const drafts = generate(input);
      const first = drafts[0];
      if (!first) return null;
      return { draftRef: draftRefFor(input, first.tone), tone: first.tone, requiresApproval: true as const };
    },
  };
}

/** On-demand reviewable draft body (for an approval preview) — never sent. */
export function renderDraftBody(input: CopilotDraftInput): { tone: string; body: string; requiresApproval: true }[] {
  return generate(input).map((d) => ({ tone: d.tone, body: d.body, requiresApproval: true as const }));
}
