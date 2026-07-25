// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · ENGAGEMENT INTELLIGENCE DOMAIN (PURE). Phase 4.
// ----------------------------------------------------------------------------
// The CANONICAL, provider-neutral engagement-intelligence taxonomy + record
// shapes. AI outputs are SUGGESTIONS ONLY — nothing here executes. Signals are
// append-only classifications OVER the Phase-3 inbox subject; suggestions are a
// bounded set of next-best-actions. No token, raw prompt/response, webhook
// payload, or Graph model is ever represented here. The taxonomy is usable for
// Facebook + Instagram without leaking any Graph-specific term.
// ============================================================================

export type Sentiment = "negative" | "neutral" | "positive" | "mixed" | "unknown";
export const SENTIMENTS: readonly Sentiment[] = ["negative", "neutral", "positive", "mixed", "unknown"];

export type Intent =
  | "lead" | "pricing_question" | "availability_question" | "project_question"
  | "general_question" | "complaint" | "escalation" | "support_request"
  | "spam" | "praise" | "feedback" | "unrelated" | "unknown";
export const INTENTS: readonly Intent[] = [
  "lead", "pricing_question", "availability_question", "project_question",
  "general_question", "complaint", "escalation", "support_request",
  "spam", "praise", "feedback", "unrelated", "unknown",
];

export type Urgency = "low" | "normal" | "high" | "critical";
export const URGENCIES: readonly Urgency[] = ["low", "normal", "high", "critical"];

export type ActionKind =
  | "suggest_reply" | "request_human_review" | "escalate" | "route_to_sales"
  | "route_to_support" | "prepare_moderation_action" | "ignore"
  | "mark_spam_candidate" | "no_action";
export const ACTION_KINDS: readonly ActionKind[] = [
  "suggest_reply", "request_human_review", "escalate", "route_to_sales",
  "route_to_support", "prepare_moderation_action", "ignore",
  "mark_spam_candidate", "no_action",
];

export type SignalProcessingState = "pending" | "scored" | "failed" | "superseded";
export type SuggestionStatus = "suggested" | "accepted" | "dismissed" | "expired";
export type IntelligenceSubjectKind = "comment_thread";

/** A single (append-only) classification of an inbox subject. */
export interface EngagementSignalRecord {
  subjectKind: IntelligenceSubjectKind;
  subjectRef: string;
  inboxConversationId: string | null;
  sentiment: Sentiment;
  sentimentScore: number;            // -100..100
  intent: Intent;
  urgency: Urgency;
  confidence: number;                // 0..100
  modelProviderSafe: string | null;
  modelNameSafe: string | null;
  modelVersionSafe: string | null;
  promptTemplateVersion: string | null;
  contentFingerprint: string;
  processingState: SignalProcessingState;
  safeErrorKind: string | null;
}

/** A bounded next-best-action suggestion derived from a signal (never executed). */
export interface NextBestActionRecord {
  actionKind: ActionKind;
  rationaleSafe: string;             // provider-neutral, content-free
  suggestedDraftRef: string | null;
  confidence: number;                // 0..100
}

/** Bounds — a suggestion set is always small + reviewable. */
export const MAX_ACTIVE_SUGGESTIONS = 3;
/** Signals below this confidence never auto-emit a high-urgency notification. */
export const MIN_NOTIFY_CONFIDENCE = 55;
/** Suggestions expire after this idle window (bounded; no forever-open cards). */
export const SUGGESTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const isSentiment = (v: unknown): v is Sentiment => typeof v === "string" && (SENTIMENTS as readonly string[]).includes(v);
export const isIntent = (v: unknown): v is Intent => typeof v === "string" && (INTENTS as readonly string[]).includes(v);
export const isUrgency = (v: unknown): v is Urgency => typeof v === "string" && (URGENCIES as readonly string[]).includes(v);
export const isActionKind = (v: unknown): v is ActionKind => typeof v === "string" && (ACTION_KINDS as readonly string[]).includes(v);
