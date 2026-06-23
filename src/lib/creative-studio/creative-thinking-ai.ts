// ============================================================================
// ZONO — Creative Thinking AI (server-side, text-only)  ·  HYBRID
// ----------------------------------------------------------------------------
// The "creative director" layer. Takes the deterministic Concept Engine output
// and OPTIONALLY enriches the *thinking* with a real LLM: sharper strategy
// (main promise / visual direction / why-convert) and an art-directed, text-free
// AI ENVIRONMENT prompt per concept (atmosphere/lighting/texture/depth only).
//
// Hard guarantees (never crossed):
//   • AI NEVER writes the rendered Hebrew (copy stays deterministic + validated).
//   • AI NEVER generates the property / agent / logo / people / any text.
//   • The environment prompt is background-only; real assets are composited on top.
// Falls back to the deterministic engine on no-key / error. Keys stay server-side.
// ============================================================================
import "server-only";
import { parseJsonLoose } from "./providers/types";
import { directConcepts, CONCEPT_LABELS, type FinalAdFacts, type FinalAdBrandAssets, type ConceptPlan, type CreativeBrief } from "./final-creative-engine";

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

function buildPrompt(brief: CreativeBrief, concepts: ConceptPlan[]): string {
  const facts = [
    brief.propertyType ? `type: ${brief.propertyType}` : "",
    brief.neighborhood ? `neighborhood: ${brief.neighborhood}` : "", brief.city ? `city: ${brief.city}` : "",
    brief.rooms != null ? `rooms: ${brief.rooms}` : "", brief.sizeSqm != null ? `sqm: ${brief.sizeSqm}` : "",
    brief.price != null ? `price: ${brief.price}` : "", brief.isLuxury ? "luxury" : "", brief.priceAttractive ? "attractive-price" : "",
  ].filter(Boolean).join(", ");
  const triggers = concepts.map((c) => c.trigger).join(", ");
  return [
    "You are a senior creative director at a leading Israeli real-estate marketing agency.",
    `Property facts: ${facts}. Target audience: ${brief.targetAudience}. Key benefit: ${brief.keyBenefit}.`,
    `For EACH of these ${concepts.length} concept triggers: [${triggers}], sharpen the creative thinking.`,
    "RULES: Do NOT write any ad copy/headline. Do NOT describe the property, agent, logo, or people.",
    "For each concept return: mainPromise (Hebrew, 1 short line), visualDirection (Hebrew, 1 line), whyConvert (Hebrew, 1 line),",
    "and environmentPrompt: an ENGLISH prompt for an image model that produces ONLY a premium abstract BACKGROUND ENVIRONMENT",
    "(atmosphere, lighting, textures, depth, framing, premium effects) with generous negative space — NO text, NO people, NO logo, NO apartment/building/interior, NO UI.",
    'Return ONLY JSON: { "concepts": [ { "trigger": "", "mainPromise": "", "visualDirection": "", "whyConvert": "", "environmentPrompt": "" } ] }',
  ].join("\n");
}

async function callGemini(key: string, prompt: string): Promise<unknown> {
  const model = process.env.ZONO_GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.8, maxOutputTokens: 2048 } }),
  });
  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned empty");
  return parseJsonLoose(text);
}
async function callOpenai(key: string, prompt: string): Promise<unknown> {
  const model = process.env.ZONO_OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.8, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenAI returned empty");
  return parseJsonLoose(text);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const hasHebrew = (s: string) => /[֐-׿]/.test(s);
const NEG = "no text, no hebrew, no people, no faces, no logo, no apartment, no building, no interior, no UI";

/** Concept Engine + optional AI creative direction. Never throws; deterministic fallback. */
export async function directConceptsAI(f: FinalAdFacts, brand: FinalAdBrandAssets): Promise<{ brief: CreativeBrief; concepts: ConceptPlan[]; provider: string }> {
  const base = directConcepts(f, brand);
  const { mode, key } = activeMode();
  if (mode === "mock") return { ...base, provider: "mock" };
  try {
    const raw = mode === "gemini" ? await callGemini(key, buildPrompt(base.brief, base.concepts)) : await callOpenai(key, buildPrompt(base.brief, base.concepts));
    const list = (raw as { concepts?: unknown[] })?.concepts;
    if (!Array.isArray(list) || !list.length) return { ...base, provider: "mock" };
    const byTrigger = new Map<string, Record<string, unknown>>();
    for (const it of list) { const t = str((it as Record<string, unknown>)?.trigger); if (t) byTrigger.set(t, it as Record<string, unknown>); }

    const concepts = base.concepts.map((c) => {
      const ai = byTrigger.get(c.trigger);
      if (!ai) return c;
      // Strategy text (Hebrew, internal-only — never rendered into the image).
      const mainPromise = str(ai.mainPromise); const visualDirection = str(ai.visualDirection); const whyConvert = str(ai.whyConvert);
      // Environment prompt (English, background-only). Guard: reject if it leaks Hebrew/forbidden words.
      let envPrompt = str(ai.environmentPrompt);
      if (envPrompt && (hasHebrew(envPrompt) || /\b(logo|agent|apartment|building|interior|text)\b/i.test(envPrompt))) envPrompt = null;
      const enrichedEnv = envPrompt
        ? { ...c.artDirection.aiEnvironment, imageModelPrompt: `${envPrompt}. ${NEG}.` }
        : c.artDirection.aiEnvironment;
      const artDirection = { ...c.artDirection, aiEnvironment: enrichedEnv };
      return {
        ...c, artDirection,
        ad: { ...c.ad, artDirection },
        mainPromise: mainPromise ?? c.mainPromise,
        visualDirection: visualDirection ?? c.visualDirection,
        whyConvert: whyConvert ?? c.whyConvert,
      };
    });
    return { brief: base.brief, concepts, provider: mode };
  } catch {
    return { ...base, provider: "mock" };
  }
}

export { CONCEPT_LABELS };
