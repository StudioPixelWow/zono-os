// ============================================================================
// ZI Expert™ — answer engine (Phase 22, server-safe / no DB).
// Glues knowledge + context + prompts + provider into a single answer. ZI is
// read-only: it explains and guides, it NEVER performs actions or mutates data.
// Caching + persistence are handled by the server (history.ts / actions.ts).
// ============================================================================
import { buildZiMessages } from "./prompts";
import { deterministicAnswer, runZiCompletion } from "./providers";
import type { ZiContext, ZiMessage, ZiSource } from "./types";

export interface ZiAnswer { content: string; source: ZiSource; model: string | null }

/**
 * Produce an answer to a question given the user's context + recent history.
 * Always returns content — the deterministic answer is used as the fallback so
 * ZI works even without an AI provider configured.
 */
export async function answerZi(ctx: ZiContext, question: string, history: ZiMessage[] = []): Promise<ZiAnswer> {
  const fallback = deterministicAnswer(ctx, question);
  const messages = buildZiMessages(ctx, question, history);
  const res = await runZiCompletion(messages, fallback);
  return { content: res.content, source: res.source, model: res.model };
}
