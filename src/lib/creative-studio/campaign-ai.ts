// ============================================================================
// ZONO — Campaign Factory AI (server-side, text-only)
// ----------------------------------------------------------------------------
// Optional AI augmentation of the deterministic campaign planner. Same env
// selection as Phase 2/3. Falls back to the engine ("mock") on no key / error.
// Planning only — no designs/visuals/prompts.
// ============================================================================
import "server-only";
import { parseJsonLoose } from "./providers/types";
import { planCampaignAssets, normalizePlannedAsset, CAMPAIGN_TYPE_LABELS, type PlanContext, type PlannedAsset } from "./campaign-engine";

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

function buildPrompt(c: PlanContext): string {
  return [
    "You are an Israeli real estate campaign strategist and Meta Ads planner.",
    `Plan a COMPLETE marketing campaign STRUCTURE (planning only — NO final designs, visuals or image prompts) for a ${c.entityType} named "${c.entityName}".`,
    `Campaign type: ${CAMPAIGN_TYPE_LABELS[c.campaignType] ?? c.campaignType}.`,
    `Campaign DNA: urgency ${c.cdna.urgency}, trust ${c.cdna.trust}, luxury ${c.cdna.luxury}, lifestyle ${c.cdna.lifestyle}, investment ${c.cdna.investment}, seller ${c.cdna.seller}, buyer ${c.cdna.buyer}, CTA intensity ${c.cdna.ctaIntensity}.`,
    c.conceptTitle ? `Anchor concept: ${c.conceptTitle} (${c.conceptAngle ?? ""}).` : "",
    c.propertyType ? `Property type: ${c.propertyType}.` : "", c.neighborhood ? `Neighborhood: ${c.neighborhood}.` : "", c.city ? `City: ${c.city}.` : "", c.priceTier ? `Price tier: ${c.priceTier}.` : "",
    "Produce 5-9 planned assets covering feed posts, stories, carousel, reel cover, and seller/buyer variants where relevant.",
    "asset_type one of: feed_post, story, carousel, reel_cover. Include audience_variant ('seller'|'buyer'|'investor') where relevant, else null. Hebrew text. priority is an integer (1 = highest).",
    'Return ONLY JSON: { "assets": [ { "asset_type": "", "title": "", "purpose": "", "recommended_message": "", "recommended_cta": "", "audience_variant": null, "priority": 1 } ] }',
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

export interface PlanResult { assets: PlannedAsset[]; provider: string }

/** Plan campaign assets via AI when available, else the deterministic engine. Never throws. */
export async function planCampaign(c: PlanContext): Promise<PlanResult> {
  const { mode, key } = activeMode();
  if (mode === "mock") return { assets: planCampaignAssets(c), provider: "mock" };
  try {
    const raw = mode === "gemini" ? await callGemini(key, buildPrompt(c)) : await callOpenai(key, buildPrompt(c));
    const list = (raw as { assets?: unknown[] })?.assets;
    const assets = Array.isArray(list) ? list.map(normalizePlannedAsset).filter((x): x is PlannedAsset => x !== null).slice(0, 12) : [];
    if (assets.length >= 4) return { assets, provider: mode };
    return { assets: planCampaignAssets(c), provider: "mock" };
  } catch {
    return { assets: planCampaignAssets(c), provider: "mock" };
  }
}
