// ============================================================================
// ZI Expert™ — provider orchestration (Phase 22).
// REUSES the Phase 15 provider abstraction (selectAiProvider + AiProvider) — no
// duplicated AI layer. Adds a deterministic fallback so ZI ALWAYS works, plus a
// chunking utility used to stream the answer to the UI (no blocking UI).
// ============================================================================
import { selectAiProvider, sanitizeContext } from "@/lib/ai-copilot";
import type { AiMessage } from "@/lib/ai-copilot/types";
import { knowledgeForModule, knowledgeForRoute } from "./knowledge";
import type { ZiContext, ZiSource } from "./types";

export interface ZiCompletion { content: string; source: ZiSource; model: string | null }

/** Is an AI provider configured? (Mirrors copilot — env-driven, vendor-neutral.) */
export function ziAiEnabled(): boolean {
  return selectAiProvider() !== null;
}

/**
 * Build a deterministic, helpful fallback answer from the knowledge base when no
 * AI provider is configured (or the provider fails). ZI never goes silent.
 */
export function deterministicAnswer(ctx: ZiContext, question: string): string {
  const k = ctx.moduleId ? knowledgeForModule(ctx.moduleId) : knowledgeForRoute(ctx.route);
  const safe = sanitizeContext(question).toString().slice(0, 240);
  const lines: string[] = [];
  lines.push(`**${k.title}**`);
  lines.push(k.summary);
  if (k.details.length) {
    lines.push("");
    for (const d of k.details) lines.push(`- ${d}`);
  }
  if (k.glossary.length) {
    lines.push("");
    lines.push("**מושגים רלוונטיים:**");
    for (const g of k.glossary) lines.push(`- **${g.term}** — ${g.definition}`);
  }
  lines.push("");
  lines.push(`לגבי "${safe}" — זה מה שאני יכול להסביר על העמוד הזה כרגע. לשאלות ספציפיות יותר על הנתונים שלך, נסה/י לנסח את השאלה סביב מה שמוצג במסך.`);
  return lines.join("\n");
}

/**
 * Run a ZI completion against the configured provider with graceful fallback.
 * Caching is handled by the caller (server). If no provider / on failure, the
 * deterministic answer is returned — the assistant is never blocked.
 */
export async function runZiCompletion(
  messages: AiMessage[],
  fallback: string,
): Promise<ZiCompletion> {
  const provider = selectAiProvider();
  if (!provider) return { content: fallback, source: "fallback", model: null };
  try {
    const text = await provider.complete(messages, { temperature: 0.4, maxTokens: 900 });
    if (text && text.trim().length > 0) return { content: text.trim(), source: "ai", model: provider.model };
    return { content: fallback, source: "fallback", model: null };
  } catch {
    return { content: fallback, source: "fallback", model: null };
  }
}

/**
 * Split text into stream-sized chunks (word-ish). The UI reveals these
 * progressively to render a real streaming/typing experience. Pure + testable.
 */
export function chunkForStream(text: string, size = 3): string[] {
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += size) {
    chunks.push(tokens.slice(i, i + size).join(""));
  }
  return chunks;
}

/** Async generator that yields a streaming answer (chunked). */
export async function* streamText(text: string, size = 3): AsyncGenerator<string> {
  for (const chunk of chunkForStream(text, size)) {
    yield chunk;
  }
}
