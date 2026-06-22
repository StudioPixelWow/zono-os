// ============================================================================
// ZONO — Copy AI (server-side, text-only)
// ----------------------------------------------------------------------------
// Optional AI generation of marketing copy. Same env selection as Phase 2-5.
// Falls back to the deterministic engine ("mock") on no key / error.
// ============================================================================
import "server-only";
import { parseJsonLoose } from "./providers/types";
import { generateCopySet, normalizeCopy, COPY_TYPE_LABELS, type CopyContext, type GeneratedCopy } from "./copy-engine";

function activeMode(): { mode: "gemini" | "openai" | "mock"; key: string } {
  const choice = (process.env.ZONO_MARKETING_ANALYSIS_PROVIDER || "").toLowerCase();
  const gemini = process.env.GEMINI_API_KEY || "";
  const openai = process.env.OPENAI_API_KEY || "";
  if (choice === "mock") return { mode: "mock", key: "" };
  if (choice === "gemini" && gemini) return { mode: "gemini", key: gemini };
  if (choice === "openai" && openai) return { mode: "openai", key: openai };
  if (gemini) return { mode: "gemini", key: gemini };
  if (openai) return { mode: "openai", key: openai };
  return { mode: "mock", key: "" };
}

function buildPrompt(c: CopyContext): string {
  return [
    "You are an Israeli real estate copywriter and Meta Ads expert. Write all copy in fluent, natural Hebrew (RTL).",
    `Write marketing COPY for an approved ${c.assetType} asset for a ${c.entityType} ("${c.entityName}"). NO designs/visuals — text only.`,
    `Objective: ${c.objective}. Audience: ${c.audience}. Angle: ${c.marketingAngle}. Emotional trigger: ${c.emotionalTrigger}. CTA style: ${c.ctaStyle}.`,
    `DNA: luxury ${c.luxury}, investment ${c.investment}, lifestyle ${c.lifestyle}, urgency ${c.urgency}, seller ${c.seller}, buyer ${c.buyer}.`,
    c.propertyType ? `Property type: ${c.propertyType}.` : "", c.neighborhood ? `Neighborhood: ${c.neighborhood}.` : "", c.city ? `City: ${c.city}.` : "",
    c.approvedPatterns.length ? `PREFER patterns: ${c.approvedPatterns.join(", ")}.` : "",
    c.rejectedPatterns.length ? `AVOID patterns: ${c.rejectedPatterns.join(", ")}.` : "",
    c.toneNote ? `Brand tone notes: ${c.toneNote}.` : "",
    `Produce 6-10 copy items covering relevant copy_type values from: ${Object.keys(COPY_TYPE_LABELS).join(", ")}.`,
    "Make it feel authentically Israeli and local. WhatsApp-first CTAs. Avoid fake luxury / generic AI tone / wrong RTL.",
    'Return ONLY JSON: { "items": [ { "copy_type":"", "title":"", "headline":"", "subheadline":"", "body":"", "cta":"", "platform":"", "tone":"", "audience":"", "reasoning":"" } ] }',
  ].filter(Boolean).join("\n");
}

async function callGemini(key: string, prompt: string): Promise<unknown> {
  const model = process.env.ZONO_GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 2560 } }),
  });
  if (!res.ok) throw new Error(`Gemini failed (${res.status})`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("empty");
  return parseJsonLoose(text);
}
async function callOpenai(key: string, prompt: string): Promise<unknown> {
  const model = process.env.ZONO_OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`OpenAI failed (${res.status})`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("empty");
  return parseJsonLoose(text);
}

export interface CopyGenResult { items: GeneratedCopy[]; provider: string }

export async function generateCopy(c: CopyContext): Promise<CopyGenResult> {
  const { mode, key } = activeMode();
  if (mode === "mock") return { items: generateCopySet(c), provider: "mock" };
  try {
    const raw = mode === "gemini" ? await callGemini(key, buildPrompt(c)) : await callOpenai(key, buildPrompt(c));
    const list = (raw as { items?: unknown[] })?.items;
    const items = Array.isArray(list) ? list.map(normalizeCopy).filter((x): x is GeneratedCopy => x !== null).slice(0, 12) : [];
    if (items.length >= 4) return { items, provider: mode };
    return { items: generateCopySet(c), provider: "mock" };
  } catch {
    return { items: generateCopySet(c), provider: "mock" };
  }
}
