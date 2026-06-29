"use server";
// ============================================================================
// 🛰️ answerWithZonoAI — official one-shot reasoning service (server action).
// Phase 27.3. The ONLY way the app obtains an AI answer.
// ----------------------------------------------------------------------------
// Flow: getContext(contextRequest) → validate → runReasoningGateway → validate
// → structured answer. AI never touches the DB; all facts come from the
// Universal Context Engine. No actions, no execution, no memory saved.
// ============================================================================
import { getContext } from "@/lib/context-engine/service";
import { runReasoningGateway } from "./gateway";
import { AI_REASONING_VERSION } from "./types";
import type { AIMode, AILanguage, AIReasoningResponse } from "./types";
import type { ContextType } from "@/lib/context-engine/types";

export interface AnswerInput {
  question: string;
  mode?: AIMode;
  language?: AILanguage;
  contextType?: ContextType;
  entityId?: string | null;
  city?: string | null;
  neighborhood?: string | null;
}

export async function answerWithZonoAI(input: AnswerInput): Promise<AIReasoningResponse> {
  const mode: AIMode = input.mode ?? "answer";
  const language: AILanguage = input.language ?? "he";

  if (!input.question || !input.question.trim()) {
    return { status: "error", answer: language === "he" ? "נא להזין שאלה." : "Please enter a question.", confidence: 0, evidence: [], missingData: [], limitations: ["empty question"], followUpQuestions: [], version: AI_REASONING_VERSION };
  }

  let context;
  try {
    context = await getContext({
      type: input.contextType ?? "mission-control",
      entityId: input.entityId ?? null,
      city: input.city ?? null,
      neighborhood: input.neighborhood ?? null,
      size: "large",
    });
  } catch (e) {
    console.error("[ai-reasoning] context build failed:", e);
    return { status: "error", answer: language === "he" ? "טעינת ההקשר נכשלה." : "Failed to load context.", confidence: 0, evidence: [], missingData: [], limitations: ["context build failed"], followUpQuestions: [], version: AI_REASONING_VERSION };
  }

  return runReasoningGateway({
    question: input.question.trim(),
    context, mode, language,
    userId: context.identity.userId,
    organizationId: context.identity.orgId,
  });
}
