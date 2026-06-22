// ============================================================================
// ZONO — Creative Studio · Gemini Vision Marketing DNA provider (server-side)
// ----------------------------------------------------------------------------
// Fetches the prioritized images server-side, base64-inlines them, and asks
// Gemini for the strict DNA JSON. Never logs file URLs or the API key.
// ============================================================================
import type { AnalysisInput, MarketingDnaProvider, MarketingDnaResult } from "./types";
import { normalizeResult, parseJsonLoose } from "./types";
import { buildPrompt } from "./prompt";

const VISION_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGES = 8;
const MAX_BYTES = 4 * 1024 * 1024;
const MODEL = process.env.ZONO_GEMINI_MODEL || "gemini-2.0-flash";

async function toInlineData(url: string, mime: string): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    return { inline_data: { mime_type: mime === "image/jpg" ? "image/jpeg" : mime, data: buf.toString("base64") } };
  } catch { return null; }
}

export function makeGeminiProvider(apiKey: string): MarketingDnaProvider {
  return {
    name: "gemini",
    async analyze(input: AnalysisInput): Promise<MarketingDnaResult> {
      const prompt = buildPrompt(input);
      const imageParts: { inline_data: { mime_type: string; data: string } }[] = [];
      for (const a of input.imageAssets.filter((x) => x.url && x.mime && VISION_MIME.includes(x.mime)).slice(0, MAX_IMAGES)) {
        const part = await toInlineData(a.url as string, a.mime as string);
        if (part) imageParts.push(part);
      }
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 2048 },
        }),
      });
      if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      if (!text) throw new Error("Gemini returned an empty response");
      return normalizeResult(parseJsonLoose(text));
    },
  };
}
