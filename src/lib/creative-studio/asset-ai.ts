// ============================================================================
// ZONO — Creative Asset AI (server-side, text-only)
// ----------------------------------------------------------------------------
// Optional AI enrichment of the deterministic asset generator. Same env as
// Phase 2-4. Falls back to the engine ("mock") on no key / error. Plans only.
// ============================================================================
import "server-only";
import { parseJsonLoose } from "./providers/types";
import { generateCreativeAssets, normalizeCreativeAsset, CREATIVE_ASSET_TYPE_LABELS, type GeneratorContext, type CreativeAsset } from "./asset-generator";

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

function buildPrompt(c: GeneratorContext): string {
  const seeds = c.seeds.map((s) => `- ${s.asset_type}${s.audience_variant ? ` [${s.audience_variant}]` : ""}${s.title ? ` · ${s.title}` : ""}${s.purpose ? ` · ${s.purpose}` : ""}`).join("\n");
  return [
    "You are an Israeli real estate creative strategist + Meta Ads expert.",
    `For an approved ${c.entityType} campaign ("${c.entityName}", type ${c.campaignType}), enrich each planned asset into a structured creative ASSET PLAN (NO final designs/images/prompts).`,
    `Campaign DNA: luxury ${c.cdna.luxury}, urgency ${c.cdna.urgency}, trust ${c.cdna.trust}, investment ${c.cdna.investment}, seller ${c.cdna.seller}, buyer ${c.cdna.buyer}, CTA intensity ${c.cdna.ctaIntensity}.`,
    c.conceptTitle ? `Anchor concept: ${c.conceptTitle} (${c.conceptAngle ?? ""}).` : "",
    c.propertyType ? `Property type: ${c.propertyType}.` : "", c.neighborhood ? `Neighborhood: ${c.neighborhood}.` : "", c.city ? `City: ${c.city}.` : "",
    "Planned assets:", seeds || "(none — propose a baseline set of 4-6)",
    `asset_type one of: ${Object.keys(CREATIVE_ASSET_TYPE_LABELS).join(", ")}. objective one of: lead_generation, awareness, engagement, conversion, trust, recruitment. Hebrew text. priority integer.`,
    'Return ONLY JSON: { "assets": [ { "asset_type":"", "title":"", "objective":"", "audience":"", "marketing_angle":"", "emotional_trigger":"", "visual_hook":"", "copy_hook":"", "cta_style":"", "recommended_layout":"", "priority":1, "reasoning":"" } ] }',
  ].filter(Boolean).join("\n");
}

async function callGemini(key: string, prompt: string): Promise<unknown> {
  const model = process.env.ZONO_GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 2048 } }),
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
    body: JSON.stringify({ model, temperature: 0.6, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`OpenAI failed (${res.status})`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("empty");
  return parseJsonLoose(text);
}

export interface AssetGenResult { assets: CreativeAsset[]; provider: string }

export async function generateAssets(c: GeneratorContext): Promise<AssetGenResult> {
  const { mode, key } = activeMode();
  if (mode === "mock") return { assets: generateCreativeAssets(c), provider: "mock" };
  try {
    const raw = mode === "gemini" ? await callGemini(key, buildPrompt(c)) : await callOpenai(key, buildPrompt(c));
    const list = (raw as { assets?: unknown[] })?.assets;
    const assets = Array.isArray(list) ? list.map(normalizeCreativeAsset).filter((x): x is CreativeAsset => x !== null).slice(0, 16) : [];
    if (assets.length >= 3) return { assets, provider: mode };
    return { assets: generateCreativeAssets(c), provider: "mock" };
  } catch {
    return { assets: generateCreativeAssets(c), provider: "mock" };
  }
}
