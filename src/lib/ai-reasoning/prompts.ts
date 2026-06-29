// ============================================================================
// ✍️ Prompt design (pure). Phase 27.3.
// ----------------------------------------------------------------------------
// Builds the system + user prompts. The model is told, unambiguously, to answer
// ONLY from the provided ContextPackage, never invent ZONO facts, cite evidence,
// and return strict JSON. No AI here — just string assembly.
// ============================================================================
import { buildContextDigest } from "./evidence";
import type { AIReasoningRequest } from "./types";

const OUTPUT_SHAPE = `{
  "status": "answered" | "insufficient_context",
  "answer": "string (the answer text)",
  "confidence": 0-100,
  "evidence": [ { "label": "string", "source": "string (a block key/source from the context)", "entityType": "string|null", "entityId": "string|null", "field": "string|null", "value": "string|null" } ],
  "missingData": ["string"],
  "limitations": ["string"],
  "followUpQuestions": ["string"]
}`;

export function buildSystemPrompt(language: "he" | "en"): string {
  return [
    "You are ZONO AI Reasoning Gateway.",
    "Use ONLY the provided context (the ContextPackage). It is the single source of truth.",
    "Do NOT invent missing facts. Do NOT use general/world knowledge for ZONO facts (brokers, offices, properties, valuations, market, deals).",
    "Do NOT invent broker, office, property, valuation, market or deal data, and do NOT fabricate entity IDs.",
    "Do NOT create recommendations unless the context already contains existing recommendations.",
    "Do NOT execute or propose to execute actions (no tasks, messages, CRM changes, workflows).",
    "If the context does not contain enough information to answer, set status to \"insufficient_context\" and explain what is missing in missingData. Never guess.",
    "Every claim in the answer must be backed by an evidence item that cites a source/key present in the context.",
    "If evidence is missing for a claim, omit the claim or state the limitation.",
    language === "he"
      ? "Answer in Hebrew (RTL) by default. Be concise and practical."
      : "Answer in English. Be concise and practical.",
    "Return ONLY a single JSON object in exactly this shape (no markdown, no extra text):",
    OUTPUT_SHAPE,
  ].join("\n");
}

const MODE_HINT: Record<AIReasoningRequest["mode"], string> = {
  explain: "Explain the reasoning behind the relevant values in the context.",
  summarize: "Summarize the relevant context concisely.",
  compare: "Compare the relevant entities/values found in the context.",
  answer: "Answer the question directly using the context.",
};

export function buildUserPrompt(req: AIReasoningRequest): string {
  return [
    `MODE: ${req.mode} — ${MODE_HINT[req.mode]}`,
    `QUESTION: ${req.question}`,
    "CONTEXT (the only facts you may use):",
    buildContextDigest(req.context),
  ].join("\n");
}
