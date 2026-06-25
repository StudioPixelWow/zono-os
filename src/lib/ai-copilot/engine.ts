// ============================================================================
// ZONO — AI provider abstraction + generate core (client-safe: fetch + env only).
// Vendor-neutral: OpenAI / Anthropic / future. selectAiProvider() picks the
// configured one (or null). generateWithProvider() always degrades gracefully to
// the deterministic fallback text — AI never blocks a workflow and never
// replaces the deterministic engines. (DB cache lives in context.ts, server-only.)
// ============================================================================
import { assertNoSecrets } from "./prompts";
import type { AiCompleteOptions, AiGenerateRequest, AiMessage, AiProvider, AiResult } from "./types";

const TIMEOUT_MS = 12_000;

function withTimeout(signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

// ── OpenAI (chat completions) ────────────────────────────────────────────────
class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  readonly model: string;
  constructor(private apiKey: string, model?: string) { this.model = model || process.env.OPENAI_ENRICHMENT_MODEL || "gpt-4o-mini"; }
  async complete(messages: AiMessage[], opts?: AiCompleteOptions): Promise<string> {
    const { signal, done } = withTimeout(opts?.signal);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages, temperature: opts?.temperature ?? 0.5, max_tokens: opts?.maxTokens ?? 900 }),
        signal,
      });
      if (!res.ok) throw new Error(`openai ${res.status}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content?.trim() ?? "";
    } finally { done(); }
  }
}

// ── Anthropic (messages) ─────────────────────────────────────────────────────
class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  constructor(private apiKey: string, model?: string) { this.model = model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest"; }
  async complete(messages: AiMessage[], opts?: AiCompleteOptions): Promise<string> {
    const { signal, done } = withTimeout(opts?.signal);
    try {
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
      const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: this.model, system, messages: turns, max_tokens: opts?.maxTokens ?? 900, temperature: opts?.temperature ?? 0.5 }),
        signal,
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const json = (await res.json()) as { content?: { text?: string }[] };
      return (json.content ?? []).map((c) => c.text ?? "").join("").trim();
    } finally { done(); }
  }
}

/** Pick a configured provider, or null (→ deterministic fallback). No lock-in. */
export function selectAiProvider(): AiProvider | null {
  if (process.env.ZONO_AI_DISABLED === "1") return null;
  const openai = process.env.OPENAI_API_KEY;
  if (openai) return new OpenAiProvider(openai);
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic) return new AnthropicProvider(anthropic);
  return null;
}

export function aiEnabled(): boolean {
  return selectAiProvider() !== null;
}

/**
 * Run a generate request against a provider with graceful fallback. Pure w.r.t.
 * the DB (caching handled by the caller). If `provider` is null or fails, returns
 * the deterministic fallback text — the workflow is never blocked.
 */
export async function generateWithProvider(req: AiGenerateRequest, provider: AiProvider | null): Promise<AiResult> {
  // Safety belt: never send credential-like content even if a fallback slipped.
  for (const m of req.messages) assertNoSecrets(m.content);
  if (!provider) return { content: req.fallback, source: "fallback", model: null, cached: false };
  try {
    const text = await provider.complete(req.messages, { temperature: req.temperature });
    if (text && text.trim().length > 0) return { content: text.trim(), source: "ai", model: provider.model, cached: false };
    return { content: req.fallback, source: "fallback", model: null, cached: false };
  } catch {
    return { content: req.fallback, source: "fallback", model: null, cached: false };
  }
}
