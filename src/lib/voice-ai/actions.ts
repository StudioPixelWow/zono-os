"use server";
// ============================================================================
// 🎙️ ZONO — Voice AI — server actions. PHASE 53.0.
// Consent-gated processing + approval-gated CRM-note apply. Nothing auto-updates.
// ============================================================================
import { revalidatePath } from "next/cache";
import { processVoice, applyVoiceSuggestion, type ProcessVoiceInput, type ProcessVoiceResult } from "./service";

export async function processVoiceAction(input: ProcessVoiceInput): Promise<ProcessVoiceResult> {
  return processVoice(input);
}

export async function applyVoiceSuggestionAction(input: { kind: string; entityType: string; entityId: string; note: string }): Promise<{ ok: boolean; error?: string; message?: string }> {
  const r = await applyVoiceSuggestion(input);
  if (r.ok) revalidatePath("/voice");
  return r;
}
