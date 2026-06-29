// ============================================================================
// 🧠 AI Reasoning Gateway™ — types (client-safe, pure). Phase 27.3.
// ----------------------------------------------------------------------------
// The official contract for AI answers in ZONO. The model NEVER reads the DB —
// it only receives a sanitized ContextPackage from the Universal Context Engine.
// Provider-agnostic (OpenAI now; Claude / Gemini / local later) via AIProvider.
// ============================================================================
import type { ContextPackage } from "@/lib/context-engine/types";

export const AI_REASONING_VERSION = "27.3.0";

export type AIMode = "explain" | "summarize" | "compare" | "answer";
export type AILanguage = "he" | "en";
export type AIReasoningStatus = "answered" | "insufficient_context" | "blocked" | "error";

export interface AIReasoningRequest {
  question: string;
  context: ContextPackage;
  mode: AIMode;
  language: AILanguage;
  userId?: string | null;
  organizationId?: string | null;
}

export interface AIEvidence {
  label: string;
  source: string;
  entityType?: string | null;
  entityId?: string | null;
  field?: string | null;
  value?: string | null;
}

export interface AIReasoningResponse {
  status: AIReasoningStatus;
  answer: string;
  confidence: number;            // 0–100
  evidence: AIEvidence[];
  missingData: string[];
  limitations: string[];
  followUpQuestions: string[];
  // Diagnostics (never sensitive) — useful for the UI / QA.
  provider?: string;
  cacheKey?: string;
  version?: string;
}

// ── Provider abstraction ─────────────────────────────────────────────────────
// One small surface every provider implements. No provider-specific logic leaks
// into the rest of the app — callers depend only on this interface.
export interface AIProviderCompletion { system: string; user: string }

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Returns the raw model text (expected to be a JSON object string). Throws on transport error. */
  complete(input: AIProviderCompletion): Promise<string>;
}
