"use server";

import { PROPERTY_TYPE_LABELS } from "./labels";
import type { AiPropertyContext, AiResult } from "./types";

function templateDescription(ctx: AiPropertyContext): string {
  const typeLabel = ctx.type ? PROPERTY_TYPE_LABELS[ctx.type] : "נכס";
  const where = [ctx.neighborhood, ctx.city].filter(Boolean).join(", ");
  const bits: string[] = [];
  bits.push(`${typeLabel}${ctx.rooms ? ` ${ctx.rooms} חדרים` : ""}${where ? ` ב${where}` : ""}.`);
  if (ctx.sizeSqm) bits.push(`שטח של כ-${ctx.sizeSqm} מ״ר${ctx.floor ? `, קומה ${ctx.floor}` : ""}.`);
  if (ctx.features?.length) bits.push(`כולל: ${ctx.features.join(", ")}.`);
  if (ctx.price) bits.push(`מחיר מבוקש: ₪${ctx.price.toLocaleString("he-IL")}.`);
  bits.push("הזדמנות מצוינת — מומלץ לתאם סיור.");
  return bits.join(" ");
}

const PROMPTS: Record<AiPropertyContext["mode"], string> = {
  description: "כתוב תיאור שיווקי מקצועי וזורם בעברית לנכס נדל״ן, 3-5 משפטים.",
  improve: "שפר וליטש את הניסוח הבא לעברית שיווקית מקצועית, שמור על העובדות.",
  facebook: "כתוב פוסט פייסבוק קצר ומושך בעברית עם אימוג׳ים מתאימים לנכס.",
  google: "כתוב מודעת Google קצרה בעברית: כותרת + תיאור, ממוקדת המרה.",
  meta_titles: "הצע 3 כותרות מטא קצרות ומושכות בעברית לנכס.",
};

/**
 * Generate marketing copy. Uses OpenAI when OPENAI_API_KEY is set; otherwise
 * falls back to a deterministic Hebrew template so the UI always works.
 */
export async function generatePropertyText(
  ctx: AiPropertyContext,
): Promise<AiResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { text: templateDescription(ctx), source: "template" };
  }

  try {
    const facts = JSON.stringify(
      {
        title: ctx.title,
        type: ctx.type ? PROPERTY_TYPE_LABELS[ctx.type] : undefined,
        city: ctx.city,
        neighborhood: ctx.neighborhood,
        rooms: ctx.rooms,
        sizeSqm: ctx.sizeSqm,
        floor: ctx.floor,
        price: ctx.price,
        features: ctx.features,
        current: ctx.current,
      },
      null,
      0,
    );

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "אתה קופירייטר נדל״ן ישראלי. ענה בעברית בלבד, בלי הקדמות, רק הטקסט המבוקש.",
          },
          { role: "user", content: `${PROMPTS[ctx.mode]}\n\nנתוני הנכס: ${facts}` },
        ],
      }),
    });

    if (!res.ok) {
      return { text: templateDescription(ctx), source: "template" };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return { text: templateDescription(ctx), source: "template" };
    return { text, source: "openai" };
  } catch (e) {
    console.error("[properties] AI generation failed:", e);
    return { text: templateDescription(ctx), source: "template" };
  }
}
