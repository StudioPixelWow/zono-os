// ============================================================================
// 🚪 AI Reasoning Gateway™ — the ONLY path from a question to a model. Phase 27.3.
// ----------------------------------------------------------------------------
// Flow: validateRequest → provider.complete(prompts) → parse → schema →
// validateResponse → structured answer. The model receives ONLY the sanitized
// ContextPackage (never the DB). Provider-agnostic. No actions, no execution.
// Not "server-only" so QA can run it offline with an injected mock provider;
// the real OpenAI call only happens inside the provider's complete().
// ============================================================================
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { parseModelJson, validateOutput } from "./schema";
import { validateRequest, validateResponse } from "./safety";
import { AI_REASONING_VERSION } from "./types";
import type {
  AIProvider, AIProviderCompletion, AIReasoningRequest, AIReasoningResponse,
  AIReasoningStatus, AILanguage,
} from "./types";

// ── Provider: OpenAI (now). Claude / Gemini / local plug in via AIProvider. ──
export function openAIProvider(): AIProvider {
  return {
    name: "openai",
    isConfigured: () => !!process.env.OPENAI_API_KEY,
    async complete(input: AIProviderCompletion): Promise<string> {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY missing");
      const model = process.env.ZONO_OPENAI_MODEL || "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, temperature: 0.2, response_format: { type: "json_object" },
          messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI failed (${res.status})`);
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("empty completion");
      return text as string;
    },
  };
}

/** The active provider, or null when none is configured (safe — never throws). */
export function selectProvider(): AIProvider | null {
  const openai = openAIProvider();
  return openai.isConfigured() ? openai : null;
}

const MSG: Record<AILanguage, Record<Exclude<AIReasoningStatus, "answered">, string>> = {
  he: {
    insufficient_context: "אין מספיק מידע בהקשר כדי לענות על השאלה.",
    blocked: "הבקשה נחסמה מטעמי בטיחות או הרשאות.",
    error: "אירעה שגיאה בעיבוד הבקשה.",
  },
  en: {
    insufficient_context: "There isn't enough information in the context to answer.",
    blocked: "The request was blocked for safety or permission reasons.",
    error: "An error occurred while processing the request.",
  },
};
const CONFIG_ERR: Record<AILanguage, string> = {
  he: "מנוע ה-AI אינו מוגדר (חסר מפתח OpenAI). פנה למנהל המערכת.",
  en: "The AI engine is not configured (missing OpenAI key). Contact your admin.",
};

function makeResp(
  status: Exclude<AIReasoningStatus, "answered">, answer: string, req: AIReasoningRequest,
  extra: Partial<AIReasoningResponse> = {},
): AIReasoningResponse {
  return {
    status, answer, confidence: 0, evidence: [], missingData: extra.missingData ?? [],
    limitations: extra.limitations ?? [], followUpQuestions: [],
    provider: extra.provider, cacheKey: req.context?.cacheKey, version: AI_REASONING_VERSION,
  };
}

/** Run one reasoning turn. Optionally inject a provider (tests / alt models). */
export async function runReasoningGateway(req: AIReasoningRequest, provider?: AIProvider): Promise<AIReasoningResponse> {
  // 1) Pre-send safety.
  const pre = validateRequest(req);
  if (!pre.ok && pre.status) {
    const msg = pre.status === "answered" ? "" : MSG[req.language][pre.status];
    return makeResp(pre.status === "answered" ? "error" : pre.status, msg, req, { limitations: pre.reason ? [pre.reason] : [] });
  }

  // 2) Provider (safe config error when missing).
  const p = provider ?? selectProvider();
  if (!p) return makeResp("error", CONFIG_ERR[req.language], req, { limitations: ["AI provider not configured (missing OPENAI_API_KEY)"] });

  // 3) Call the model with ONLY the sanitized context.
  let raw: unknown;
  try {
    const text = await p.complete({ system: buildSystemPrompt(req.language), user: buildUserPrompt(req) });
    raw = parseModelJson(text);
  } catch (e) {
    console.error("[ai-reasoning] provider error:", e);
    return makeResp("error", MSG[req.language].error, req, { limitations: ["provider transport error"], provider: p.name });
  }

  // 4) Schema validation.
  const parsed = validateOutput(raw);
  if (!parsed.ok || !parsed.value) {
    return makeResp("blocked", MSG[req.language].blocked, req, { limitations: ["model output failed schema validation", ...parsed.errors], provider: p.name });
  }
  const resp: AIReasoningResponse = { ...parsed.value, provider: p.name, cacheKey: req.context.cacheKey, version: AI_REASONING_VERSION };

  // Honest downgrade: schema may have set insufficient_context (e.g. no evidence).
  if (resp.status !== "answered") {
    return { ...resp, answer: resp.answer || MSG[req.language].insufficient_context };
  }

  // 5) Post-response safety (evidence references must be real; no fabricated ids).
  const post = validateResponse(resp, req);
  if (!post.ok && post.status) {
    return makeResp(post.status === "answered" ? "blocked" : post.status, MSG[req.language][post.status === "answered" ? "blocked" : post.status], req,
      { limitations: post.reason ? [post.reason] : [], provider: p.name, missingData: resp.missingData });
  }
  return resp;
}
