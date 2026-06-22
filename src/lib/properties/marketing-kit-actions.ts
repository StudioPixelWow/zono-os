"use server";

/**
 * Server action wrapper for the AI Marketing Kit. Builds the deterministic kit
 * (client-safe engine) and, when OPENAI_API_KEY is set, rewrites only the lead
 * descriptions from the SAME facts list — never inventing features. Always
 * falls back to the deterministic kit on any error.
 */
import {
  buildMarketingKit,
  TONE_PROMPTS,
  type MarketingKit,
  type MarketingKitInput,
} from "./marketing-kit";

export async function generateMarketingKitAction(
  input: MarketingKitInput,
): Promise<MarketingKit> {
  const kit = buildMarketingKit(input);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return kit;
  try {
    const facts = JSON.stringify(kit.factsUsed);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "אתה קופירייטר נדל״ן ישראלי. השתמש אך ורק בעובדות שניתנו — אל תמציא מאפיינים, נוף, פארק או ים. עברית בלבד. החזר JSON עם המפתחות: short, premium, emotional, family, investor, luxury.",
          },
          {
            role: "user",
            content: `${TONE_PROMPTS[input.tone]}. עובדות הנכס (JSON): ${facts}. כתוב 6 גרסאות תיאור על בסיס העובדות בלבד.`,
          },
        ],
      }),
    });
    if (!res.ok) return kit;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return kit;
    const parsed = JSON.parse(content) as Partial<Record<keyof MarketingKit, string>>;
    return {
      ...kit,
      short: parsed.short || kit.short,
      premium: parsed.premium || kit.premium,
      emotional: parsed.emotional || kit.emotional,
      family: parsed.family || kit.family,
      investor: parsed.investor || kit.investor,
      luxury: parsed.luxury || kit.luxury,
      source: "openai",
    };
  } catch (e) {
    console.error("[marketing-kit] OpenAI augmentation failed:", e);
    return kit;
  }
}
