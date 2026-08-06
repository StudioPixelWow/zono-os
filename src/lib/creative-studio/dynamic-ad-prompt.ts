// ============================================================================
// ZONO creative-studio — DYNAMIC AI art-direction prompt (server-only).
// ----------------------------------------------------------------------------
// "תיצור בבינה מלאכותית כל פעם פרומפט חדשני שמתאים לתמונה" — instead of one stale
// hardcoded mega-prompt, an LLM writes a FRESH, innovative, premium art-direction
// brief for THIS property on every generation (different concept & composition
// each time). We then append NON-NEGOTIABLE deterministic locks (exact Hebrew
// strings, exact brand hex, supplied-asset rules) so creative freedom never
// costs data integrity. The finished brief drives gpt-image-2 (full-ad design).
//
// Never throws — falls back to the proven static buildAdPrompt on any failure.
// ============================================================================
import "server-only";
import { buildAdPrompt, resolveSaleLabel, normalizeIlsPrice, type AdSpec, type AdGenAssets } from "./openai-ad-pipeline";

/** Deterministic hard locks appended after the AI-written creative brief. These
 *  guarantee the correctness floor no matter what the LLM invents. */
function buildLocks(spec: AdSpec, assets: AdGenAssets, correction: string): string {
  const saleLabel = resolveSaleLabel(spec);
  const address = [spec.street, spec.city].filter(Boolean).join(", ");
  const price = normalizeIlsPrice(spec.price ?? undefined) ?? "";
  const colors = [spec.palette.bg, spec.palette.bg2, spec.palette.accent].filter(Boolean).join(", ");

  const refs: string[] = [];
  const nImg = Math.min(assets.propertyImages.length, 4);
  for (let i = 0; i < nImg; i++) refs.push(`reference image ${refs.length + 1} = REAL property photo ${i + 1}/${nImg} — keep photorealistic & unaltered`);
  if (assets.logoUrl) refs.push(`reference image ${refs.length + 1} = the OFFICIAL office logo — reproduce EXACTLY; never redraw/recolor/distort`);
  if (assets.agentPhoto) refs.push(`reference image ${refs.length + 1} = the AGENT photo — use EXACTLY; never regenerate/stylize the face`);

  const lines = [
    "════ NON-NEGOTIABLE LOCKS (override any creative choice above) ════",
    "TEXT-LOCK — render ONLY these EXACT Hebrew strings, crisp, perfectly legible right-to-left. Reproduce letter-for-letter. NEVER rewrite, abbreviate, translate, autocorrect, duplicate or invent letters. No text may appear that is not in this list:",
    `• sale label = "${saleLabel}"  (LARGE premium badge — the most prominent text element)`,
    `• headline = "${spec.headline}"`,
    spec.subheadline ? `• subheadline = "${spec.subheadline}"` : "",
    address ? `• address = "${address}"  (highly visible, not tiny footer text)` : "",
    price ? `• price = "${price}"  (Israeli format EXACTLY: ₪ then digits with comma thousands, no space after ₪; strongest emphasis after the headline)` : "",
    spec.kind === "sold" ? "SOLD-AD PRICE RULE — this is a 'נמכר' (SOLD) ad: NEVER display any price, sum, number+₪ or 'מחיר' figure anywhere in the design; a price on a sold ad is a critical failure." : "",
    spec.agentName ? `• agent name = "${spec.agentName}"` : "",
    spec.agentPhone ? `• agent phone = "${spec.agentPhone}"  (Latin digits, LTR)` : "",
    spec.logoText ? `• office name = "${spec.logoText}"` : "",
    spec.cta ? `• optional short CTA = "${spec.cta}" — include ONLY if it does not harm Hebrew spelling.` : "",
    spec.features?.length ? `• feature chips — render EXACTLY these ${spec.features.length} chips, letter-for-letter and digit-for-digit, and NO other feature chips: ${spec.features.map((f) => `"${f}"`).join(", ")}` : "",
    "HEBREW VALIDATION: every Hebrew string must be 100% correctly spelled (e.g. 'למכירה' never 'למכירת'; the agent name must be exact — never a similar-looking word). If you cannot render a string perfectly, reproduce the EXACT provided characters verbatim.",
    "NUMERIC-LOCK — the rooms count, size in מ״ר, floor (קומה), price and phone are FACTS. Never invent, change, round, swap or drop a single digit; render each number EXACTLY as written in the copy/feature chips above. Do NOT show any room count, square-meterage or floor that is not listed above (a wrong number is a critical failure).",
    `BRAND-COLOR LOCK — use ONLY the supplied brand palette (${colors}). Do NOT introduce random gold/cyan/orange/gradients that are not in the palette. Headline uses the brand's light-on-dark text; price uses the ACCENT; the logo, badges and dividers stay locked to the palette. Brand consistency outranks any color idea above.`,
    refs.length ? `SUPPLIED ASSETS — ${refs.join("; ")}. Use ALL supplied assets exactly; never invent or substitute logos, faces, colors or the property.` : "",
    "TECHNICAL LOCK: do NOT alter the logo or the agent's face; phone/price digits must be exact; render nothing beyond the locked copy. Vertical 4:5.",
    correction ? `CORRECTION (previous attempt failed QA — fix ONLY these, keep the same visual direction):\n${correction}` : "",
    "════ END LOCKS ════",
  ];
  return lines.filter(Boolean).join("\n");
}

const SYS = `You are the lead designer for TOP Israeli real-estate brokers' social ads — the polished, BRIGHT, conversion-focused posts leading agents run on Facebook/Instagram. For the property you receive, WRITE a single art-direction brief instructing an image model to DESIGN a COMPLETE premium Hebrew real-estate advertisement in THIS recognizable, information-rich style:
- A large, BRIGHT, inviting real property photo as the hero — use the SUPPLIED property reference photo EXACTLY (well-lit and real; never dark, moody or AI-invented).
- The AGENT'S cut-out portrait integrated prominently on one side, professional and trustworthy — use the SUPPLIED agent reference photo EXACTLY (same real face, never invented or restyled), with a brand-colored name tag and a short 'call now' line.
- The office LOGO placed prominently — use the SUPPLIED logo reference EXACTLY (never redraw, recolor or invent it).
- A clean feature bar: only 3-4 refined line ICONS + ULTRA-SHORT, perfectly legible Hebrew labels (e.g. rooms, size, floor, parking) — minimal and breathing, never crowded or tiny.
- A LARGE, unmissable phone number with a WhatsApp icon on a clean chip.
- A bold headline (project/street name) + supporting subtitle, with elegant brand-color accents (underline, dividers, name tag) from the brand palette.
Overall feel: bright, clean, high-end, warm and trustworthy — but ELEVATED to award-winning polish: impeccable visual hierarchy (headline → price → property → agent/contact), generous breathing room and whitespace, refined premium editorial typography with clear scale contrast, crisp alignment to a grid, and subtle depth (soft shadows, delicate dividers). Restrained and EXPENSIVE-looking; never cluttered, crowded or visually overloaded. Aim for a genuine 'WOW' — a top-1% broker campaign that looks like a leading agency made it. NOT dark/editorial, NOT a Canva template, NOT a plain photo with text. Vary the exact composition per property while keeping this signature language. Output ONLY the brief prose in English (6-12 sentences), no preamble, no bullet headers — do NOT restate exact copy or hex values (those are locked separately).`;

/**
 * Build a fresh, AI-written art-direction prompt for the full ad, then append the
 * deterministic locks. gpt-image-2 designs the whole ad from this. Falls back to
 * the static buildAdPrompt when no LLM/key is available or the call fails.
 */
export async function buildDynamicAdPrompt(spec: AdSpec, assets: AdGenAssets, correction: string, conceptBrief?: string | null): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return buildAdPrompt(spec, assets, correction);
  const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4o";
  const ctx = {
    kind: spec.kind, conceptLabel: spec.conceptLabel, propertyType: spec.propertyType,
    city: spec.city, street: spec.street, rooms: spec.rooms, sqm: spec.sqm, floor: spec.floor,
    features: spec.features, brandPersonality: spec.brandPersonality,
    emotionalFeel: spec.emotionalFeel, visualStory: spec.visualStory,
    hasLogo: Boolean(assets.logoUrl), hasAgentPhoto: Boolean(assets.agentPhoto), propertyPhotos: Math.min(assets.propertyImages.length, 4),
  };
  // When the agent picked/edited a specific design direction ("3 options" flow),
  // REALIZE exactly that direction — expand its intent into a full English brief,
  // keep the chosen concept, never swap it for a generic layout.
  const brief = (conceptBrief ?? "").trim();
  const userMsg = brief
    ? `The agent has CHOSEN this exact design direction for the ad (it may be written in Hebrew). Realize THIS direction faithfully — translate its intent into a complete art-direction brief, keep its concept, mood and layout idea, do NOT replace it with a generic layout:\n"""${brief}"""\n\nProperty context (JSON):\n${JSON.stringify(ctx)}`
    : `Property context (JSON). Invent a fresh concept — do NOT reuse a standard layout:\n${JSON.stringify(ctx)}`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: textModel, temperature: brief ? 0.7 : 0.95, max_tokens: 620,
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) return buildAdPrompt(spec, assets, correction);
    const json = await res.json();
    const written = (json?.choices?.[0]?.message?.content ?? "").trim();
    if (!written || written.length < 80) return buildAdPrompt(spec, assets, correction);
    return `ZONO PREMIUM REAL ESTATE CREATIVE ENGINE — fresh art direction for this property:\n${written}\n\n${buildLocks(spec, assets, correction)}`;
  } catch {
    return buildAdPrompt(spec, assets, correction);
  }
}
