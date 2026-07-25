// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE SAFE READ MODELS (PURE). Phase 4.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. The provider-neutral classification + bounded
// suggestions ARE the product and are surfaced (sentiment, intent, urgency,
// confidence, safe rationale, safe model provenance). NEVER a raw prompt, raw
// model response, token, lease token, provider payload, Graph field, or any
// content fragment. `suggestedDraftRef` is a reference only — the draft text is
// fetched through the Copilot's own reviewable-draft surface, never inlined here.
// ============================================================================
import type { StoredSignal, StoredSuggestion } from "./ports";

export interface SignalDTO {
  id: string; subjectRef: string; sentiment: string; sentimentScore: number; intent: string; urgency: string;
  confidence: number; modelProviderSafe: string | null; modelNameSafe: string | null; promptTemplateVersion: string | null;
  processingState: string; computedAt: string;
}
export function toSignalDTO(s: StoredSignal): SignalDTO {
  return { id: s.id, subjectRef: s.subjectRef, sentiment: s.sentiment, sentimentScore: s.sentimentScore, intent: s.intent, urgency: s.urgency, confidence: s.confidence, modelProviderSafe: s.modelProviderSafe, modelNameSafe: s.modelNameSafe, promptTemplateVersion: s.promptTemplateVersion, processingState: s.processingState, computedAt: s.computedAtIso };
}

export interface SuggestionDTO {
  id: string; actionKind: string; rationaleSafe: string; hasDraft: boolean; suggestedDraftRef: string | null;
  confidence: number; status: string;
}
export function toSuggestionDTO(s: StoredSuggestion): SuggestionDTO {
  return { id: s.id, actionKind: s.actionKind, rationaleSafe: s.rationaleSafe, hasDraft: !!s.suggestedDraftRef, suggestedDraftRef: s.suggestedDraftRef, confidence: s.confidence, status: s.status };
}

export interface ConversationIntelligenceDTO {
  conversationId: string;
  current: SignalDTO | null;
  suggestions: readonly SuggestionDTO[];
  history: readonly SignalDTO[];
  unavailableReason: string | null;   // safe reason when no current signal yet
}
export function toConversationIntelligence(conversationId: string, current: StoredSignal | null, suggestions: readonly StoredSuggestion[], history: readonly StoredSignal[]): ConversationIntelligenceDTO {
  return {
    conversationId,
    current: current ? toSignalDTO(current) : null,
    suggestions: suggestions.map(toSuggestionDTO),
    history: history.map(toSignalDTO),
    unavailableReason: current ? null : "not_scored_yet",
  };
}
