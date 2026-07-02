// ============================================================================
// 💬 Ask ZONO — pure orchestration. 30.1.
// understand → plan (server executes the planned engines) → compose the answer.
// Pure; the multi-engine execution lives in the server service (reuse only).
// ============================================================================
import { understandQuery } from "./intent";
import { planContext } from "./planner";
import { synthesizeAnswer } from "./synthesis";
import { ASK_ZONO_VERSION, type QueryUnderstanding, type ContextPlan, type EngineResult, type AskZonoResponse, type ChatTurn } from "./types";

/** Step 1+2 — understand the query and plan which engines must answer. */
export function understandAndPlan(raw: string, history: ChatTurn[] = []): { understanding: QueryUnderstanding; plan: ContextPlan } {
  const understanding = understandQuery(raw, history);
  const plan = planContext(understanding);
  return { understanding, plan };
}

/** Step 4+ — compose the final response from the executed engine results. */
export function composeResponse(understanding: QueryUnderstanding, plan: ContextPlan, results: EngineResult[]): AskZonoResponse {
  const answer = synthesizeAnswer(understanding, plan, results);
  const notes: string[] = [];
  if (understanding.intent === "UNKNOWN") notes.push("כוונה לא זוהתה — הוצגו שאלות מוצעות.");
  if (plan.engines.length && !results.length) notes.push("המנועים המתוכננים לא החזירו תוצאות.");
  return { version: ASK_ZONO_VERSION, generatedAt: new Date().toISOString(), understanding, plan, results, answer, notes };
}

/** Convenience for offline tests / callers that already have results. */
export function askWithResults(raw: string, results: EngineResult[], history: ChatTurn[] = []): AskZonoResponse {
  const { understanding, plan } = understandAndPlan(raw, history);
  return composeResponse(understanding, plan, results);
}
