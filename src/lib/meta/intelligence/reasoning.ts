// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · REASONING GATEWAY ADAPTER (server). Phase 4.
// ----------------------------------------------------------------------------
// The production `ReasoningGateway` — the ONLY place classification reaches a
// model, and it does so through the SHIPPED AI Reasoning boundary's provider
// abstraction (`selectProvider` / `AIProvider` from @/lib/ai-reasoning). It does
// NOT construct its own HTTP/model call, does NOT re-implement a provider, and is
// NOT a second gateway — it reuses the one AI boundary. It parses STRICT JSON with
// a safe fallback, bounds retries at the engine (not here), and records ONLY safe
// provenance (provider bucket + template version). No raw prompt or raw response
// is ever returned or persisted; transport/parse failures return a safe errorKind.
// ============================================================================
import "server-only";
import { selectProvider, type AIProvider } from "@/lib/ai-reasoning";
import { parseModelJson } from "@/lib/ai-reasoning/schema";
import type { ReasoningGateway, ReasoningInput, ReasoningResult } from "./ports";
import { buildSystemPrompt, buildUserPrompt, PROMPT_TEMPLATE_VERSION } from "./prompts";
import type { RawClassification } from "./classify";

const AI_TIMEOUT_MS = 12_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/** Build the production reasoning gateway. `provider` is injectable for staging. */
export function createReasoningGateway(provider?: AIProvider): ReasoningGateway {
  return {
    async classify(input: ReasoningInput): Promise<ReasoningResult> {
      const p = provider ?? selectProvider();
      if (!p) return { classification: null, provider: null, modelName: null, modelVersion: null, promptTemplateVersion: PROMPT_TEMPLATE_VERSION, errorKind: "not_configured" };
      let text: string;
      try {
        text = await withTimeout(p.complete({ system: buildSystemPrompt(), user: buildUserPrompt({ platform: input.platform, context: input.context, insightHint: input.insightHint }) }), AI_TIMEOUT_MS);
      } catch {
        // No raw prompt/response in logs — only a safe category.
        return { classification: null, provider: p.name, modelName: null, modelVersion: null, promptTemplateVersion: PROMPT_TEMPLATE_VERSION, errorKind: "ai_transport_error" };
      }
      const raw = parseModelJson(text);
      if (!raw || typeof raw !== "object") {
        return { classification: null, provider: p.name, modelName: null, modelVersion: null, promptTemplateVersion: PROMPT_TEMPLATE_VERSION, errorKind: null }; // downstream validateClassification → safe fallback (invalid output, not transport)
      }
      const o = raw as Record<string, unknown>;
      const classification: RawClassification = { sentiment: o.sentiment, sentimentScore: o.sentimentScore, intent: o.intent, urgency: o.urgency, confidence: o.confidence, rationale: o.rationale };
      return { classification, provider: p.name, modelName: null, modelVersion: null, promptTemplateVersion: PROMPT_TEMPLATE_VERSION, errorKind: null };
    },
  };
}
