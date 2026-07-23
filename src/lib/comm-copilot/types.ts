// ============================================================================
// 🤖 ZONO — AI Communication Copilot (Batch 6.7) · canonical TYPES.
// ----------------------------------------------------------------------------
// The Copilot is a READ-ONLY consumer of the canonical Communication OS. It is
// transport-agnostic by construction: it reasons over a channel-free projection
// of a canonical Conversation + Message[], never branching on the transport.
// These are pure types — no logic, no I/O, no transport/Evolution/WhatsApp import.
// Every generated artifact carries an Explainability envelope (no black boxes).
// ============================================================================

// ── Explainability (cross-cutting, mandatory) ───────────────────────────────
/** Structured reasoning attached to EVERY generated artifact. */
export interface Explainability {
  confidence: number;                 // 0–100
  reasoning: string[];                // ordered human-readable "why"
  evidence: string[];                 // evidence statements
  evidenceMessageIds: string[];       // canonical message ids that drove it
  deterministicSignals: string[];     // which deterministic analyzers fired
  llmContribution: { used: boolean; note?: string } | null; // null = fully deterministic
}

// ── Transport-agnostic analysis projection ──────────────────────────────────
/** One message reduced to what analysis needs — NO channel, NO transport. */
export interface AnalysisMessage {
  seq: number;                        // position in the conversation (0-based)
  messageRef: string;                 // canonical message id (for evidence)
  direction: "inbound" | "outbound" | null;
  sentAt: string;                     // ISO
  text: string;                       // verbatim message text (Message.preview)
}

/** The channel-free view the Copilot analyzers consume. Two canonical
 *  conversations with identical content but different channels MUST produce an
 *  identical `transcript`/`waiting`/`counts` here (proven in QA). */
export interface CopilotConversationView {
  conversationRef: string;            // canonical id `${channel}:${sourceId}`
  agentId: string | null;             // assigned broker (from participants)
  waiting: boolean;                   // canonical fact: newest msg inbound & unanswered
  unread: number;
  messageCount: number;
  lastActivityAt: string | null;
  transcript: AnalysisMessage[];      // channel-free, ordered oldest→newest
  crmLinks: {
    lead: string | null; buyer: string | null; seller: string | null;
    journey: string | null; deal: string | null; property: string | null;
  };
}

// ── Artifact enums (Copilot's OWN vocabulary — avoids forbidden field names) ─
export type ConversationClassification =
  | "new_lead" | "active_buyer" | "active_seller" | "negotiation"
  | "appointment" | "follow_up" | "document_exchange" | "inactive" | "closed";

export type CopilotSentiment =
  | "positive" | "neutral" | "hesitant" | "frustrated" | "high_intent";

/** Deliberately NOT named `next_best_action` (a forbidden Tier-A literal). */
export type RecommendedActionKind =
  | "call" | "whatsapp" | "meeting" | "reminder" | "send_property" | "follow_up";

export type MilestoneKind =
  | "first_contact" | "offer" | "meeting" | "negotiation" | "document" | "appointment";

// ── Generated artifacts (each carries Explainability) ───────────────────────
export interface ClassificationArtifact { classification: ConversationClassification; explain: Explainability }
export interface SentimentArtifact { sentiment: CopilotSentiment; explain: Explainability }
export interface RecommendedActionArtifact { action: RecommendedActionKind; explain: Explainability }

// ── Missing-response / attention (Phase 2) ──────────────────────────────────
export type AttentionKind = "waiting_too_long" | "unanswered_question" | "forgotten" | "urgent";
export interface AttentionFlag {
  kind: AttentionKind;
  severity: "low" | "medium" | "high";
  reason: string;
  evidenceMessageIds: string[];
  signals: string[];
}

export type ReplyTone = "professional" | "friendly" | "persuasive";
export interface ReplySuggestionArtifact {
  tone: ReplyTone;
  body: string;
  requiresApproval: true;             // ALWAYS — the Copilot never sends
  explain: Explainability;
}

/** Per-section summary contribution (which messages + facts fed each section). */
export interface SummarySectionContribution {
  section: "stage" | "intent" | "facts" | "objections" | "promises" | "next_action";
  statement: string;
  evidenceMessageIds: string[];
  signals: string[];
}
export interface SummaryArtifact {
  stage: string; intent: string; facts: string[]; objections: string[]; promises: string[]; nextAction: string;
  contributions: SummarySectionContribution[];
  explain: Explainability;
}

// ── Human feedback loop (evaluation-only — never auto-retrains) ──────────────
export type CopilotArtifactType = "reply_suggestion" | "classification" | "summary" | "recommendation";
export type ReplyFeedback = "accepted" | "rejected" | "edited" | "ignored";
export type ClassificationFeedback = "correct" | "incorrect";
export type UsefulnessFeedback = "useful" | "not_useful";
export type FeedbackValue = ReplyFeedback | ClassificationFeedback | UsefulnessFeedback;

export interface FeedbackRecord {
  artifactType: CopilotArtifactType;
  artifactRef: string;
  conversationRef: string;
  userId: string;
  feedback: FeedbackValue;
  editedText?: string | null;
  createdAt: string;
}

export interface FeedbackMetrics {
  totalReplies: number; acceptanceRate: number; rejectionRate: number; correctionRate: number; suggestionUsage: number;
  totalClassifications: number; classificationAccuracy: number;
  summaryUsefulness: number; recommendationUsefulness: number;
}
