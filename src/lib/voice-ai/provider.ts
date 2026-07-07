// ============================================================================
// 🎙️ ZONO — Voice AI — transcription provider abstraction (pure). PHASE 53.0.
// No transcription provider is bundled. This resolves configuration from env and
// stays MOCK-SAFE: when unconfigured it does NOT fabricate a transcript — it
// reports "no_provider". A directly-supplied transcript (WhatsApp already-typed,
// manual paste, or a future live provider result) is passed through and validated.
// This module never records audio.
// ============================================================================
import type { VoiceConfig, TranscriptResult } from "./types";

/** Resolve the (optional) transcription provider from env. Mock when unconfigured. */
export function resolveVoiceConfig(env: Record<string, string | undefined> = {}): VoiceConfig {
  const provider = env.VOICE_TRANSCRIPTION_PROVIDER?.trim() || null;
  const key = env.VOICE_TRANSCRIPTION_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || null;
  const missing: string[] = [];
  if (!provider) missing.push("VOICE_TRANSCRIPTION_PROVIDER");
  if (!key) missing.push("VOICE_TRANSCRIPTION_API_KEY");
  const mode: "live" | "mock" = provider && key ? "live" : "mock";
  return { provider: mode === "live" ? provider : null, mode, missing };
}

const wc = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/**
 * Prepare a transcript for processing. If `providedText` exists we use it (the
 * safe path — no recording, no provider needed). Otherwise, with only an audio
 * reference and no live provider, we honestly report "no_provider" rather than
 * inventing content.
 */
export function prepareTranscript(input: { providedText?: string | null; hasAudio?: boolean }, cfg: VoiceConfig): TranscriptResult {
  const text = (input.providedText ?? "").trim();
  if (text) return { ok: true, text, wordCount: wc(text), reason: "provided" };
  if (!input.hasAudio) return { ok: false, text: "", wordCount: 0, reason: "empty_audio" };
  if (cfg.mode !== "live") return { ok: false, text: "", wordCount: 0, reason: "no_provider" };
  // A live provider would run here; we never fabricate its output offline.
  return { ok: false, text: "", wordCount: 0, reason: "transcription_failed" };
}

/** Deterministic, dependency-free transcript hash (djb2) for idempotency/dedup. */
export function transcriptHash(text: string): string {
  const norm = text.trim().replace(/\s+/g, " ").toLowerCase();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return `v${h.toString(16)}`;
}

/** Human status line for the UI. */
export function describeProviderState(cfg: VoiceConfig): string {
  return cfg.mode === "live"
    ? `ספק תמלול מחובר: ${cfg.provider}.`
    : `אין ספק תמלול מוגדר — ניתן להדביק תמלול ידני. להפעלת תמלול אוטומטי הגדר: ${cfg.missing.join(", ")}.`;
}
