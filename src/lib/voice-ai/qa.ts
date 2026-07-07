// ============================================================================
// 🎙️ ZONO — Voice AI — offline self-check (pure). PHASE 53.0.
// Spec QA: voice note, meeting audio, missing provider, failed transcription,
// entity extraction, duplicate transcript, suggested follow-up, approval gate.
// ============================================================================
import { resolveVoiceConfig, prepareTranscript, transcriptHash } from "./provider";
import { extractVoiceMemory } from "./extract";

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // 1. Voice note → memory with summary + suggestions.
  const note = extractVoiceMemory("הלקוח מעוניין בדירה, שאל כמה עולה ורוצה לקבוע סיור מחר בשעה 17:00. הטלפון שלו 050-1234567.", "voice_note");
  add("voice note: has content + summary", note.hasContent && note.summary.length > 0);
  add("voice note: consent required", note.consentRequired && note.consentLabel.includes("הסכמה"));

  // 2. Meeting audio (longer) → multiple key points + suggestions.
  const meeting = extractVoiceMemory("נפגשנו בנכס ברחוב הרצל. הלקוח אמר שהמחיר קצת יקר והוא מתלבט. דיברנו על תקציב של 2,000,000 ₪ ואפשרות משכנתא. סיכמנו להיפגש שוב שבוע הבא לסיור נוסף.", "meeting_audio");
  add("meeting: key points extracted", meeting.keyPoints.length >= 2);
  add("meeting: suggestions present", meeting.suggestions.length >= 2);

  // 3. Missing provider → mock mode, honest reason (no fabrication).
  const cfg = resolveVoiceConfig({});
  add("missing provider: mock mode + missing vars", cfg.mode === "mock" && cfg.missing.length >= 1 && cfg.provider === null);
  const noProv = prepareTranscript({ hasAudio: true }, cfg);
  add("missing provider: audio + no provider → no_provider", noProv.ok === false && noProv.reason === "no_provider");

  // 4. Failed transcription / empty audio.
  const emptyAudio = prepareTranscript({ hasAudio: false }, cfg);
  add("failed: empty audio reason", emptyAudio.ok === false && emptyAudio.reason === "empty_audio");
  const emptyMem = extractVoiceMemory("", "voice_note");
  add("failed: empty transcript → no content, no fabricated suggestions", !emptyMem.hasContent && emptyMem.suggestions.length === 0);

  // 5. Provided transcript passes through even without a provider.
  const provided = prepareTranscript({ providedText: "טקסט תמלול ידני" }, cfg);
  add("provided transcript: ok passthrough", provided.ok && provided.reason === "provided" && provided.wordCount === 3);

  // 6. Entity extraction (phones / amounts / dates).
  add("entities: phone + amount + date + place", note.entities.phones.length === 1 && meeting.entities.amounts.length >= 1 && note.entities.dates.length >= 1 && meeting.entities.places.length >= 1);

  // 7. Duplicate transcript → identical hash.
  add("duplicate: stable hash", transcriptHash("שלום עולם") === transcriptHash(" שלום   עולם ") && note.transcriptHash === extractVoiceMemory("הלקוח מעוניין בדירה, שאל כמה עולה ורוצה לקבוע סיור מחר בשעה 17:00. הטלפון שלו 050-1234567.", "voice_note").transcriptHash);

  // 8. Suggested follow-up present for price/interest.
  add("follow-up: suggested for price question", note.suggestions.some((s) => s.kind === "follow_up" || s.kind === "task"));

  // 9. Approval gate — every suggestion requires approval; amounts carry disclaimer.
  add("approval gate: all suggestions require approval", note.suggestions.every((s) => s.requiresApproval === true) && meeting.suggestions.every((s) => s.requiresApproval === true));
  add("no promise: amount → disclaimer", meeting.disclaimers.some((d) => d.includes("התחייבות")));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
