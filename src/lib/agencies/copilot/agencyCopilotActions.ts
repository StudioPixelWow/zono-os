"use server";
// ============================================================================
// ZONO — PHASE 26.10: AI Copilot server action. Safe, typed entry point for a
// future chat UI. Validates the org from the session, answers the question via
// the grounded service, and returns a typed result. No full UI yet.
// ============================================================================
import { currentOrgId } from "../_context";
import { answerAgencyIntelQuestion, getSuggestedAgencyQuestions } from "./agencyCopilotService";
import type { AgencyCopilotAnswer, SuggestedQuestion } from "./agencyCopilotTypes";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function askAgencyCopilot(question: string): Promise<Result<AgencyCopilotAnswer>> {
  try {
    if (!question || !question.trim()) return { ok: false, error: "לא הוזנה שאלה." };
    const org = await currentOrgId();
    return { ok: true, data: await answerAgencyIntelQuestion(org, question) };
  } catch (e) { return fail(e); }
}

export async function getAgencyCopilotSuggestionsAction(): Promise<Result<SuggestedQuestion[]>> {
  try {
    const org = await currentOrgId();
    return { ok: true, data: await getSuggestedAgencyQuestions(org) };
  } catch (e) { return fail(e); }
}
