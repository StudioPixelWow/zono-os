// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE CLASSIFICATION PROMPT (PURE). Phase 4.
// ----------------------------------------------------------------------------
// Deterministic prompt construction for the classification call. PROVIDER-NEUTRAL:
// the model is asked ONLY to classify a bounded, already-public comment window
// into the canonical taxonomy and return STRICT JSON. No Graph term, no token, no
// instruction to take an action (AI output is a suggestion only). The template is
// versioned so provenance is recorded; the text itself is never persisted.
// ============================================================================
import { SENTIMENTS, INTENTS, URGENCIES } from "./domain";
import type { ContextItem } from "./fingerprint";
import type { MetaPlatform } from "../types";

export const PROMPT_TEMPLATE_VERSION = "meta-intel-classify-v1";

export function buildSystemPrompt(): string {
  return [
    "You classify social-media engagement for a real-estate business. You NEVER take actions and NEVER draft replies here — you only classify.",
    "Return STRICT JSON only, no prose, with exactly these keys:",
    '{ "sentiment": <one of ' + SENTIMENTS.join("|") + ">,",
    '  "sentimentScore": <integer -100..100>,',
    '  "intent": <one of ' + INTENTS.join("|") + ">,",
    '  "urgency": <one of ' + URGENCIES.join("|") + ">,",
    '  "confidence": <integer 0..100>,',
    '  "rationale": <short provider-neutral reason, no quotes of the content, no links> }',
    "If unsure, use unknown / normal / a low confidence. Do not invent facts.",
  ].join("\n");
}

export function buildUserPrompt(input: { platform: MetaPlatform; context: readonly ContextItem[]; insightHint: string | null }): string {
  const lines = input.context.map((c, i) => `${i + 1}. [${c.fromPage ? "page" : "user"}${c.author ? ` ${c.author}` : ""}] ${c.text}`);
  const parts = [
    `Source: unified social inbox (${input.platform}). Classify the following public comment thread window.`,
    ...lines,
  ];
  if (input.insightHint) parts.push(`Context hint (aggregate metrics, non-identifying): ${input.insightHint}`);
  parts.push("Return the strict JSON classification now.");
  return parts.join("\n");
}
