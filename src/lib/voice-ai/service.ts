// ============================================================================
// 🎙️ ZONO — Voice AI — service (server-only). PHASE 53.0.
// Resolves the transcription provider (mock-safe), extracts structured memory,
// and persists it as an activity_event (REUSING the Activity Layer — no new
// table). SAFETY: processing REQUIRES consent confirmation; nothing updates the
// CRM without an explicit approved apply; amounts are never treated as promises.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { logActivityEvent, getRecentOrganizationActivity } from "@/lib/activity/service";
import { resolveVoiceConfig, prepareTranscript, describeProviderState } from "./provider";
import { extractVoiceMemory } from "./extract";
import { SOURCE_HE, type VoiceMemory, type VoiceSource } from "./types";

const REASON_HE: Record<string, string> = {
  no_provider: "אין ספק תמלול מוגדר — הדבק תמלול ידני או הגדר ספק.",
  empty_audio: "אין אודיו ואין טקסט לעיבוד.",
  transcription_failed: "התמלול נכשל — נסה שוב או הדבק טקסט ידנית.",
};

export interface VoiceProviderInfo { mode: "live" | "mock"; provider: string | null; missing: string[]; description: string }
export function getVoiceProviderInfo(): VoiceProviderInfo {
  const cfg = resolveVoiceConfig(process.env as Record<string, string | undefined>);
  return { mode: cfg.mode, provider: cfg.provider, missing: cfg.missing, description: describeProviderState(cfg) };
}

export interface ProcessVoiceInput {
  transcript?: string | null;
  hasAudio?: boolean;
  source: VoiceSource;
  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  consentConfirmed: boolean;
}
export interface ProcessVoiceResult { memory?: VoiceMemory; transcript?: string; persisted?: boolean; duplicate?: boolean; error?: string }

/** Process a transcript into structured memory (consent-gated; persists when linked). */
export async function processVoice(input: ProcessVoiceInput): Promise<ProcessVoiceResult> {
  // SAFETY GATE — no processing without explicit consent confirmation.
  if (!input.consentConfirmed) return { error: "נדרש אישור הסכמה להקלטה/תמלול לפני עיבוד." };

  const cfg = resolveVoiceConfig(process.env as Record<string, string | undefined>);
  const tr = prepareTranscript({ providedText: input.transcript, hasAudio: input.hasAudio }, cfg);
  if (!tr.ok) return { error: REASON_HE[tr.reason ?? "transcription_failed"] ?? "עיבוד נכשל." };

  const memory = extractVoiceMemory(tr.text, input.source);

  // Persist as structured memory ONLY when linked to a real entity (no fabricated links).
  let persisted = false, duplicate = false;
  if (input.entityType && input.entityId) {
    try {
      const db = await createClient();
      const { data: existing } = await db.from("activity_events").select("id")
        .eq("event_type", "voice.processed").eq("entity_id", input.entityId)
        .eq("metadata->>transcript_hash" as never, memory.transcriptHash as never).limit(1);
      if (existing && existing.length) duplicate = true;
      else {
        await logActivityEvent({
          eventType: "voice.processed", entityType: input.entityType, entityId: input.entityId,
          title: `${SOURCE_HE[input.source]} — סיכום`, description: memory.summary || null, sentiment: memory.sentiment,
          metadata: { transcript_hash: memory.transcriptHash, source: input.source, intents: memory.intents, word_count: memory.wordCount, consent: true, entity_counts: { phones: memory.entities.phones.length, amounts: memory.entities.amounts.length } },
        });
        persisted = true;
      }
    } catch { /* best-effort persistence; memory still returned */ }
  }

  return { memory, transcript: tr.text, persisted, duplicate };
}

export interface ApplySuggestionInput { kind: string; entityType: string; entityId: string; note: string }
/** Apply an APPROVED suggestion. Only the safe CRM-note write happens here. */
export async function applyVoiceSuggestion(input: ApplySuggestionInput): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (input.kind !== "crm_note") return { ok: false, error: "פעולה זו מתבצעת במסך היעד — אינה מבוצעת אוטומטית." };
  if (!input.entityType || !input.entityId) return { ok: false, error: "נדרש לקשר ללקוח/נכס לפני שמירת הערה." };
  try {
    await logActivityEvent({
      eventType: "note.created", entityType: input.entityType, entityId: input.entityId,
      title: "הערת CRM מהודעה קולית", description: input.note.slice(0, 2000), channel: "voice",
      metadata: { source: "voice_ai", approved: true },
    });
    return { ok: true, message: "ההערה נשמרה (לאחר אישורך)." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שמירת ההערה נכשלה" };
  }
}

export interface RecentVoiceItem { id: string; title: string; summary: string | null; source: string | null; at: string }
/** Recently processed voice memories (from the activity layer). */
export async function listRecentVoiceMemories(limit = 10): Promise<RecentVoiceItem[]> {
  await getSessionContext();
  const rows = await getRecentOrganizationActivity(80).catch(() => []);
  return rows
    .filter((r) => r.event_type === "voice.processed")
    .slice(0, limit)
    .map((r) => ({ id: r.id, title: r.title, summary: r.description, source: (r.metadata as Record<string, unknown> | null)?.source as string ?? null, at: r.occurred_at }));
}
