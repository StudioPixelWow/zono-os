// ============================================================================
// ZONO — Creative Concept AI (server-side, text-only)
// ----------------------------------------------------------------------------
// Optional AI augmentation of the deterministic concept engine. Uses the same
// env selection as Phase 2. Falls back to the engine ("mock") on no key / error.
// Keys stay server-side. No visuals — strategic concepts only.
// ============================================================================
import "server-only";
import { parseJsonLoose } from "./providers/types";
import { generateConceptsFromContext, normalizeConcept, CONCEPT_TYPE_LABELS, type ConceptContext, type GeneratedConcept } from "./concept-engine";

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

function buildPrompt(c: ConceptContext): string {
  return [
    "You are an Israeli real estate marketing strategist, a senior project marketer, a Meta Ads expert, a listing-conversion expert and a seller-recruitment expert.",
    `Generate 4-8 strategic real-estate CREATIVE CONCEPTS (strategy only, NO visuals/copy production) for a ${c.entityType} named "${c.entityName}".`,
    `Marketing DNA scores (0-100): luxury ${c.luxury}, investment ${c.investment}, lifestyle ${c.lifestyle}, urgency ${c.urgency}, sales ${c.sales}, seller-focus ${c.sellerFocus}, buyer-focus ${c.buyerFocus}.`,
    c.propertyType ? `Property type: ${c.propertyType}.` : "",
    c.neighborhood ? `Neighborhood: ${c.neighborhood}.` : "", c.city ? `City: ${c.city}.` : "", c.priceTier ? `Price tier: ${c.priceTier}.` : "",
    c.preferredAngles.length ? `LEARN — preferred angles: ${c.preferredAngles.join(", ")}.` : "",
    c.rejectedAngles.length ? `AVOID — rejected angles: ${c.rejectedAngles.join(", ")}.` : "",
    c.approvedConceptTypes.length ? `Previously APPROVED concept types (favor): ${c.approvedConceptTypes.join(", ")}.` : "",
    c.rejectedConceptTypes.length ? `Previously REJECTED concept types (avoid): ${c.rejectedConceptTypes.join(", ")}.` : "",
    `Choose concept_type values from: ${Object.keys(CONCEPT_TYPE_LABELS).join(", ")}.`,
    "Concepts must feel authentically Israeli and local. Adapt to property type, audience, location and price tier.",
    "Write all text values in Hebrew. confidence_score is an integer 0-100.",
    'Return ONLY a JSON object: { "concepts": [ { "title": "", "concept_type": "", "description": "", "marketing_angle": "", "emotional_trigger": "", "visual_hook": "", "copy_hook": "", "recommended_layout": "", "recommended_cta_style": "", "recommended_audience": "", "reasoning": "", "confidence_score": 0 } ] }',
  ].filter(Boolean).join("\n");
}

async function callGemini(key: string, prompt: string): Promise<unknown> {
  const model = process.env.ZONO_GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 2048 } }),
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
    body: JSON.stringify({ model, temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenAI returned empty");
  return parseJsonLoose(text);
}

export interface ConceptGenResult { concepts: GeneratedConcept[]; provider: string }

/** Generate concepts via AI when available, else the deterministic engine. Never throws. */
export async function generateConcepts(c: ConceptContext): Promise<ConceptGenResult> {
  const { mode, key } = activeMode();
  if (mode === "mock") return { concepts: generateConceptsFromContext(c), provider: "mock" };
  try {
    const raw = mode === "gemini" ? await callGemini(key, buildPrompt(c)) : await callOpenai(key, buildPrompt(c));
    const list = (raw as { concepts?: unknown[] })?.concepts;
    const concepts = Array.isArray(list) ? list.map(normalizeConcept).filter((x): x is GeneratedConcept => x !== null).slice(0, 8) : [];
    if (concepts.length >= 3) return { concepts, provider: mode };
    // weak AI output → fall back to engine
    return { concepts: generateConceptsFromContext(c), provider: "mock" };
  } catch {
    return { concepts: generateConceptsFromContext(c), provider: "mock" };
  }
}
