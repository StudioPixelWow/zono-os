// ============================================================================
// 🤖 ZONO — Copilot REPLY SUGGESTIONS (pure). Phase 3.
// ----------------------------------------------------------------------------
// REUSES the existing Draft Studio composer (`composeBody`) — it does NOT build
// a new generation engine. Produces exactly three tones (professional / friendly
// / persuasive), each an approval-only proposal with a Copilot Explainability
// envelope. The Copilot NEVER sends. Draft Studio tone mapping:
//   professional → "professional" · friendly → "friendly" · persuasive → "negotiation".
// ============================================================================
import { composeBody } from "@/lib/draft-studio/compose";
import type { CommContext, Purpose, Tone as DsTone, EntityKind } from "@/lib/draft-studio/types";
import { buildExplain } from "./explain";
import type { CopilotConversationView, ReplySuggestionArtifact, ReplyTone, ConversationClassification, SummaryArtifact, RecommendedActionArtifact } from "./types";

const TONE_MAP: Record<ReplyTone, DsTone> = { professional: "professional", friendly: "friendly", persuasive: "negotiation" };
const TONES: ReplyTone[] = ["professional", "friendly", "persuasive"];

const PURPOSE_BY_CLASS: Record<ConversationClassification, Purpose> = {
  new_lead: "first_contact", active_buyer: "listing_update", active_seller: "follow_up",
  negotiation: "negotiation", appointment: "appointment_confirmation", follow_up: "follow_up",
  document_exchange: "document_request", inactive: "follow_up", closed: "thank_you",
};

function buildContext(view: CopilotConversationView, classification: ConversationClassification, summary: SummaryArtifact, rec: RecommendedActionArtifact): CommContext {
  const entityKind: EntityKind = view.crmLinks.seller ? "seller" : view.crmLinks.buyer ? "buyer" : view.crmLinks.lead ? "lead" : "customer";
  const name = view.clientName ?? "";
  return {
    entityKind, entityId: view.conversationRef, name, firstName: name.split(" ")[0] ?? "",
    brokerName: null, officeName: null, journeyStage: classification,
    trust: null, relationshipPath: [], truthScore: null,
    recommendation: rec.explain.reasoning[0] ?? null, strategy: null, reason: rec.explain.reasoning[0] ?? null,
    missionGoal: null, lastActivity: view.lastActivityAt,
    facts: summary.facts, preferences: summary.facts, propertyTitle: null, price: null,
  };
}

/** Generate the three approval-gated reply suggestions (proposals only). */
export function generateReplySuggestions(
  view: CopilotConversationView, classification: ConversationClassification, summary: SummaryArtifact, rec: RecommendedActionArtifact,
  confidence: number,
): ReplySuggestionArtifact[] {
  const ctx = buildContext(view, classification, summary, rec);
  const purpose = PURPOSE_BY_CLASS[classification];
  const lastInbound = [...view.transcript].reverse().find((m) => m.direction === "inbound")?.messageRef;
  const evidence = [lastInbound, ...summary.contributions.filter((c) => c.section === "facts").flatMap((c) => c.evidenceMessageIds)].filter(Boolean) as string[];

  return TONES.map((tone) => {
    const body = composeBody(ctx, "whatsapp", purpose, TONE_MAP[tone], "he");
    return {
      tone,
      body,
      requiresApproval: true as const,
      explain: buildExplain({
        confidence,
        reasoning: [`טיוטת תשובה בטון ${tone} עבור שיחה בשלב ${classification}`, ...(rec.explain.reasoning[0] ? [rec.explain.reasoning[0]] : [])],
        evidence: [`purpose:${purpose}`, `draft_studio_tone:${TONE_MAP[tone]}`],
        evidenceMessageIds: [...new Set(evidence)],
        deterministicSignals: [`classification:${classification}`, `tone:${tone}`, `purpose:${purpose}`],
        llmContribution: null,
      }),
    };
  });
}
