// ============================================================================
// ZONO — Creative Studio · OpenAI Vision Marketing DNA provider (server-side)
// ----------------------------------------------------------------------------
// Sends the prioritized image URLs + prompt to OpenAI and requests strict JSON.
// Never logs file URLs or the API key.
// ============================================================================
import type { AnalysisInput, MarketingDnaProvider, MarketingDnaResult } from "./types";
import { normalizeResult, parseJsonLoose } from "./types";
import { buildPrompt } from "./prompt";

const VISION_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGES = 8;
const MODEL = process.env.ZONO_OPENAI_MODEL || "gpt-4o-mini";

export function makeOpenAiProvider(apiKey: string): MarketingDnaProvider {
  return {
    name: "openai",
    async analyze(input: AnalysisInput): Promise<MarketingDnaResult> {
      const prompt = buildPrompt(input);
      const imageContent = input.imageAssets
        .filter((a) => a.url && a.mime && VISION_MIME.includes(a.mime))
        .slice(0, MAX_IMAGES)
        .map((a) => ({ type: "image_url" as const, image_url: { url: a.url as string } }));
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL, temperature: 0.4, response_format: { type: "json_object" },
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("OpenAI returned an empty response");
      return normalizeResult(parseJsonLoose(text));
    },
  };
}
