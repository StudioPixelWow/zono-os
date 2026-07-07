// ============================================================================
// 🎙️ ZONO — Voice AI — barrel. PHASE 53.0.
// Voice/call/meeting transcript → structured memory (summary, entities, intents,
// approval-gated suggestions). Provider abstraction is mock-safe; no recording,
// no fabricated transcript, consent required, nothing auto-updates the CRM.
// ============================================================================
export {
  VOICE_AI_VERSION, SOURCE_HE, SUGGESTION_HE, CONSENT_LABEL, NO_PROMISE_DISCLAIMER,
  type VoiceSource, type VoiceMemory, type VoiceSuggestion, type SuggestionKind,
  type DetectedEntities, type VoiceIntent, type Sentiment, type VoiceConfig, type TranscriptResult,
} from "./types";
export { resolveVoiceConfig, prepareTranscript, transcriptHash, describeProviderState } from "./provider";
export { extractVoiceMemory } from "./extract";
export { getVoiceProviderInfo, processVoice, applyVoiceSuggestion, listRecentVoiceMemories, type VoiceProviderInfo } from "./service";
export { runSelfCheck } from "./qa";
