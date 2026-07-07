// ============================================================================
// 🎙️ ZONO — Voice AI — types (pure, client-safe). PHASE 53.0.
// Turns a voice note / call / meeting TRANSCRIPT into structured memory: summary,
// detected entities, intents, and APPROVAL-GATED suggestions (CRM note, task,
// mission, follow-up, draft). Safety-first: consent is always required, nothing
// updates the CRM without explicit approval, and no legal/financial promises are
// made. Transcription itself is done by a provider abstraction (mock-safe) — this
// module never records audio and never fabricates a transcript.
// ============================================================================

export const VOICE_AI_VERSION = "53.0";

export type VoiceSource = "voice_note" | "call_recording" | "meeting_audio" | "manual_transcript" | "whatsapp_voice";

export const SOURCE_HE: Record<VoiceSource, string> = {
  voice_note: "הודעה קולית", call_recording: "הקלטת שיחה", meeting_audio: "אודיו פגישה",
  manual_transcript: "תמלול ידני", whatsapp_voice: "הודעה קולית בוואטסאפ",
};

export interface DetectedEntities {
  phones: string[];
  amounts: string[];   // monetary figures MENTIONED (not commitments)
  dates: string[];     // date / time hints for follow-up
  places: string[];    // streets / neighborhoods / property hints
  contacts: string[];  // mentioned people
}

export type VoiceIntent = "interested" | "price_question" | "schedule_viewing" | "objection" | "negotiation" | "not_relevant" | "general";
export type Sentiment = "positive" | "neutral" | "negative";

export type SuggestionKind = "crm_note" | "task" | "mission" | "follow_up" | "draft";

export const SUGGESTION_HE: Record<SuggestionKind, string> = {
  crm_note: "הערת CRM", task: "משימה", mission: "משימת פעולה", follow_up: "מעקב", draft: "טיוטת הודעה",
};

export interface VoiceSuggestion {
  id: string;
  kind: SuggestionKind;
  label: string;
  detail: string;
  requiresApproval: true;     // ALWAYS — nothing auto-updates the CRM
  canApplyInline: boolean;    // true = safe approved log (CRM note); false = deep-link to the existing creator
  targetHref: string | null;
  evidence: string[];
}

export interface VoiceMemory {
  hasContent: boolean;
  source: VoiceSource;
  consentRequired: boolean;
  consentLabel: string;
  summary: string;
  keyPoints: string[];
  entities: DetectedEntities;
  intents: VoiceIntent[];
  sentiment: Sentiment;
  suggestions: VoiceSuggestion[];
  disclaimers: string[];
  wordCount: number;
  transcriptHash: string;
}

// ── Provider abstraction ──────────────────────────────────────────────────────
export interface VoiceConfig {
  provider: string | null;        // resolved provider name, or null when unconfigured
  mode: "live" | "mock";
  missing: string[];              // env vars needed for a live provider
}

export interface TranscriptResult {
  ok: boolean;
  text: string;
  wordCount: number;
  reason?: "no_provider" | "empty_audio" | "transcription_failed" | "provided";
}

export const CONSENT_LABEL =
  "⚠️ הקלטה ותמלול מחייבים הסכמה. ודא שכל המשתתפים יודעים ומסכימים להקלטה/לתמלול. אין להקליט בסתר. הסיכומים וההצעות הם מידע בלבד — ללא התחייבות משפטית או פיננסית, ושום עדכון CRM אינו מתבצע ללא אישורך.";

export const NO_PROMISE_DISCLAIMER =
  "סכומים/מחירים שהוזכרו הם ציטוט מהשיחה בלבד — אינם הצעה מחייבת או התחייבות משפטית/פיננסית.";
