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
    spec.agentName ? `• agent name = "${spec.agentName}"` : "",
    spec.agentPhone ? `• agent phone = "${spec.agentPhone}"  (Latin digits, LTR)` : "",
    spec.logoText ? `• office name = "${spec.logoText}"` : "",
    spec.cta ? `• optional short CTA = "${spec.cta}" — include ONLY if it does not harm Hebrew spelling.` : "",
    "HEBREW VALIDATION: every Hebrew string must be 100% correctly spelled (e.g. 'למכירה' never 'למכירת'; the agent name must be exact — never a similar-looking word). If you cannot render a string perfectly, reproduce the EXACT provided characters verbatim.",
    `BRAND-COLOR LOCK — use ONLY the supplied brand palette (${colors}). Do NOT introduce random gold/cyan/orange/gradients that are not in the palette. Headline uses the brand's light-on-dark text; price uses the ACCENT; the logo, badges and dividers stay locked to the palette. Brand consistency outranks any color idea above.`,
    refs.length ? `SUPPLIED ASSETS — ${refs.join("; ")}. Use ALL supplied assets exactly; never invent or substitute logos, faces, colors or the property.` : "",
    "TECHNICAL LOCK: do NOT alter the logo or the agent's face; phone/price digits must be exact; render nothing beyond the locked copy. Vertical 4:5.",
    correction ? `CORRECTION (previous attempt failed QA — fix ONLY these, keep the same visual direction):\n${correction}` : "",
    "════ END LOCKS ════",
  ];
  return lines.filter(Boolean).join("\n");
}

const SYS = `You are an award-winning real-estate advertising ART DIRECTOR (Architectural Digest / luxury developer launch caliber). For the property you receive, WRITE a single fresh, innovative, premium art-direction brief that instructs an image model to DESIGN a COMPLETE Hebrew real-estate advertisement — a designed campaign, never a photo with text slapped on, never a Canva/Wix template. Every brief must be DIFFERENT and specific to this property: pick a distinctive concept, composition, layout and mood that fit its character. Describe: the creative concept, the composition/layout, how the real property photo is used as the hero (~65-80%), the editorial typography treatment, premium design elements (frames, glass panels, elegant dividers, a refined icon system), and how the branding, agent and contact block integrate elegantly. Aim for the best real-estate campaigns in the world. Output ONLY the brief prose in English (6-12 sentences), no preamble, no bullet headers — do NOT restate exact copy or hex values (those are locked separately).`;

/**
 * Build a fresh, AI-written art-direction prompt for the full ad, then append the
 * deterministic locks. gpt-image-2 designs the whole ad from this. Falls back to
 * the static buildAdPrompt when no LLM/key is available or the call fails.
 */
export async function buildDynamicAdPrompt(spec: AdSpec, assets: AdGenAssets, correction: string): Promise<string> {
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
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: textModel, temperature: 0.95, max_tokens: 620,
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: `Property context (JSON). Invent a fresh concept — do NOT reuse a standard layout:\n${JSON.stringify(ctx)}` },
        ],
      }),
    });
    if (!res.ok) return buildAdPrompt(spec, assets, correction);
    const json = await res.json();
    const brief = (json?.choices?.[0]?.message?.content ?? "").trim();
    if (!brief || brief.length < 80) return buildAdPrompt(spec, assets, correction);
    return `ZONO PREMIUM REAL ESTATE CREATIVE ENGINE — fresh art direction for this property:\n${brief}\n\n${buildLocks(spec, assets, correction)}`;
  } catch {
    return buildAdPrompt(spec, assets, correction);
  }
}
