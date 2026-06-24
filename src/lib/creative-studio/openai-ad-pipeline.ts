// ============================================================================
// ZONO — OpenAI Creative GENERATION primitives (server-only)
// ----------------------------------------------------------------------------
// The image model is the DESIGNER: real assets (property/subject photos, logo,
// agent photo) go in as reference images + a full art-direction brief, and
// gpt-image-1 returns the COMPLETE finished ad. This module exposes the raw
// generation call + the vision read-back used by the QA engine. The pass/fail
// DECISION is made deterministically in creative-qa.ts — never by the LLM.
// ============================================================================
import "server-only";
import { resolveImageProvider } from "./visual-providers";
import type { SourceManifest, QaVisionFindings, CreativeScores, CreativeHardFails } from "./creative-qa";

const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const VISION_MODEL = () => process.env.OPENAI_VISION_MODEL || "gpt-4o";

export type AdKind = "property" | "sold" | "testimonial";

/** Everything the image model needs to render a finished ad — kind-agnostic. */
export interface AdSpec {
  kind: AdKind; conceptLabel: string;
  saleLabel?: string | null;           // large premium badge — defaults to "למכירה" ("נמכר" for sold)
  headline: string; subheadline?: string | null;
  priceLabel?: string | null; price?: string | null;
  features: string[]; cta: string;
  agentName?: string | null; agentPhone?: string | null;
  city?: string | null; street?: string | null;
  rooms?: string | null; sqm?: string | null; floor?: string | null;
  logoText?: string | null; disclaimer?: string | null;
  palette: { bg: string; bg2: string; accent: string };
  brandPersonality?: string | null;   // e.g. "quiet luxury", "modern premium", "energetic commercial"
  propertyType?: string | null;        // for authenticity (boutique / luxury / family / urban feel)
  emotionalFeel?: string | null; visualStory?: string | null;
}
export interface AdGenAssets { propertyImages: string[]; logoUrl: string | null; agentPhoto: string | null }

export function providerIsOpenAI(): boolean { return resolveImageProvider().provider === "openai"; }

/** The default large premium badge — "למכירה" for live listings, "נמכר" for sold. */
export function resolveSaleLabel(spec: AdSpec): string {
  const explicit = (spec.saleLabel ?? "").trim();
  if (explicit) return explicit;
  return spec.kind === "sold" ? "נמכר" : "למכירה";
}

/** Israeli real-estate price format: ₪1,620,000 — no space after ₪, comma
 *  thousands separators. Returns the original string when there are no digits. */
export function normalizeIlsPrice(price: string | null | undefined): string | null {
  if (!price) return null;
  const digits = price.replace(/[^\d]/g, "");
  if (!digits) return price;
  return `₪${Number(digits).toLocaleString("en-US")}`;
}

/** Source-Data Lock: the manifest is the ONLY text the ad may contain. */
export function buildSourceManifest(spec: AdSpec): SourceManifest {
  return {
    saleLabel: resolveSaleLabel(spec),
    headline: spec.headline, subheadline: spec.subheadline ?? null,
    price: normalizeIlsPrice(spec.price),
    address: [spec.street, spec.city].filter(Boolean).join(", ") || null,
    city: spec.city ?? null, street: spec.street ?? null,
    rooms: spec.rooms ?? null, sqm: spec.sqm ?? null, floor: spec.floor ?? null,
    features: spec.features.filter(Boolean),
    agentName: spec.agentName ?? null, phone: spec.agentPhone ?? null,
    cta: spec.cta, disclaimer: spec.disclaimer ?? null, logoText: spec.logoText ?? null,
  };
}

export function refUrlsFor(assets: AdGenAssets): string[] {
  // Up to 4 property photos so the model can build a real COLLAGE, plus logo + agent.
  return [...assets.propertyImages.slice(0, 4), assets.logoUrl, assets.agentPhoto].filter(Boolean) as string[];
}

/** Full art-direction brief — the ZONO PREMIUM REAL ESTATE CREATIVE ENGINE
 *  (locked by user mandate). The image model is the DESIGNER and renders a
 *  COMPLETE, finished premium campaign image. ALL corrections happen inside this
 *  AI flow — no canvas, no HTML overlay, no deterministic renderer, no local
 *  text editing. Only the dynamic values, the EXACT Hebrew copy, the supplied-
 *  asset map and the QA correction change per request. */
export function buildAdPrompt(spec: AdSpec, assets: AdGenAssets, correction: string): string {
  const colors = [spec.palette.bg, spec.palette.bg2, spec.palette.accent].filter(Boolean).join(", ");
  const saleLabel = resolveSaleLabel(spec);
  const address = [spec.street, spec.city].filter(Boolean).join(", ");
  // Israeli price format ₪1,620,000 (no space after ₪, comma separators).
  const priceLine = normalizeIlsPrice(spec.price) ?? "";

  // NO feature/spec strip in the image (user mandate): property facts are never
  // rendered as an icon row, a specification row, a facts section or a table.

  // Supplied-asset map so the model knows which reference image is which.
  const refs: string[] = [];
  const nImg = Math.min(assets.propertyImages.length, 4);
  for (let i = 0; i < nImg; i++) refs.push(`reference image ${refs.length + 1} = REAL property photo ${i + 1}/${nImg} — keep photorealistic & unaltered, never redesign the building`);
  if (assets.logoUrl) refs.push(`reference image ${refs.length + 1} = the OFFICIAL OFFICE LOGO — reproduce EXACTLY; never redraw, recolor, distort or invent`);
  if (assets.agentPhoto) refs.push(`reference image ${refs.length + 1} = the AGENT photo — use EXACTLY; never regenerate, stylize, alter or replace the face`);

  // Creative brief assembled from the supplied property context (NO feature
  // strings — those become icons, never text paragraphs).
  const brief = [
    spec.visualStory,
    spec.emotionalFeel,
    spec.propertyType ? `property character: ${spec.propertyType}` : "",
    address ? `location: ${address}` : "",
  ].filter(Boolean).join(" — ") || "premium residential property";

  const kindLine =
    spec.kind === "sold"
      ? `Campaign type: a proud yet understated '${saleLabel} / JUST SOLD' announcement — celebratory and elegant; the badge treatment is tasteful, never a loud sticker.`
      : spec.kind === "testimonial"
        ? "Campaign type: a warm client-testimonial campaign — trust-led, with the property still the hero behind an elegant quote."
        : "Campaign type: a lifestyle acquisition campaign for a property on the market.";

  const lines = [
    'ZONO PREMIUM REAL ESTATE CREATIVE ENGINE — CREATIVE-FIRST MODE. You are an AWARD-WINNING ART DIRECTOR designing a premium real-estate ADVERTISING CAMPAIGN from scratch. DESIGN the advertisement — do not place text blocks over a photo. The viewer must feel "I want to live there" BEFORE they think "this property is for sale". Sell emotion before information, atmosphere before specifications, ownership before features.',
    "ABSOLUTELY FORBIDDEN (this is the #1 rule): do NOT produce a plain property photo with a text overlay; do NOT produce a template, a card, a flyer, a listing layout, a Canva/Wix-style composition, or a real-estate post. If the result looks like a photo with text slapped on top, it is REJECTED. The output must look ART-DIRECTED: a designed campaign with intentional composition, layered depth, editorial typography and a clear creative concept — like a real human art director made it.",
    "REFERENCE BAR — every ad must feel like: Architectural Digest, a luxury developer launch campaign, a premium real-estate brochure, or Apple-style marketing. Cinematic, expensive, editorial, aspirational.",
    kindLine,
    `Concept: ${spec.conceptLabel}. Property brief: ${brief}.`,
    refs.length ? `SUPPLIED ASSETS — ${refs.join("; ")}. Use ALL supplied assets; never invent or substitute any of them.` : "",

    // ── PRIORITY: CREATIVE DIRECTOR > QA ──────────────────────────────────────
    "PRIORITY (in order): (1) CREATIVE EXCELLENCE — a stunning, art-directed, scroll-stopping campaign is the primary KPI; spend the effort to make it beautiful; (2) EXACT TEXT PRESERVATION — every Hebrew string spelled exactly as locked below; (3) BRAND CONSISTENCY. Creative quality outranks validation: never flatten the design into a safe template to satisfy a checklist. A boring, templated, or overlay-style layout is a FAILURE even if every word is correct.",

    "PROPERTY HERO RULE: the real property photography is the hero and the emotional anchor (~65–80% of the frame), integrated into a DESIGNED composition — not a full-bleed photo with a caption. Use art-director techniques: cinematic crop, depth, negative space, an elegant type system, refined dividers and brand accents. Treat it like a luxury architectural-magazine COVER, not a property card.",
    "VISUAL STORYTELLING: respect architecture, composition, interior design, lighting and depth. Do not cover important rooms or block architectural features. Let the property breathe and create desire through atmosphere.",

    // ── TEXT-LOCK (spec §3) — EXACT strings, never altered ─────────────────────
    "════ TEXT-LOCK — render ONLY these EXACT Hebrew strings, crisp and perfectly legible right-to-left (RTL). Reproduce each string letter-for-letter. NEVER rewrite, NEVER abbreviate, NEVER invent, NEVER autocorrect, NEVER replace letters, NEVER add similar words, NEVER translate, NEVER duplicate letters. No text may appear on the image that is not in this list: ════",
    "HEBREW VALIDATION (mandatory before finalizing): every Hebrew string must be 100% correctly spelled (e.g. 'למכירה' never 'למכירת'). If you cannot render a string with 100% correct spelling, reproduce the EXACT provided characters verbatim — never substitute a similar-looking or similar-sounding word, never approximate, never paraphrase. PRESERVE EXACTLY and never alter: the property address, the property type, the agent name, the office name and the phone number. Never invent an address, a Hebrew word, or a number.",
    `• {{sale_label}} = "${saleLabel}"  ← LARGE, premium, highly visible — a luxury campaign HEADLINE BADGE (not a cheap sticker). This is the most prominent text element.`,
    `• {{headline}} = "${spec.headline}"`,
    spec.subheadline ? `• {{subheadline}} = "${spec.subheadline}"` : "",
    address ? `• {{property_address}} = "${address}"  ← HIGHLY VISIBLE and prominent. NOT tiny footer text, NOT legal copy. This is mandatory, large and easy to read.` : "",
    priceLine ? `• {{price}} = "${priceLine}"  ← Israeli real-estate format EXACTLY as written (₪ then digits with comma thousands, NO space after ₪). Render it LARGER than the other supporting text with the STRONGEST visual emphasis — it is the primary commercial element, second only to the headline. Confident and premium, never shouty.` : "",
    spec.agentName ? `• {{agent_name}} = "${spec.agentName}"` : "",
    spec.agentPhone ? `• {{agent_phone}} = "${spec.agentPhone}"  (Latin digits, keep LTR, impossible to miss yet never promotional)` : "",
    spec.logoText ? `• {{office_name}} = "${spec.logoText}"` : "",
    spec.cta ? `• Optional short CTA = "${spec.cta}" — include ONLY if it does not harm Hebrew spelling accuracy; otherwise omit it.` : "",
    "════ END TEXT-LOCK ════",

    // ── TEXT HIERARCHY (spec §2) ──────────────────────────────────────────────
    "TEXT HIERARCHY (top → bottom of importance and visual weight): {{sale_label}} → {{headline}} → {{property_address}} → {{price}} / CTA / agent. The sale label and the address must both be unmistakably visible.",

    // ── TEXT REDUCTION (spec §4 + §11) — to free the ART DIRECTOR, not to bare the photo ──
    "TEXT ECONOMY: keep the worded text minimal so the DESIGN can breathe — fewer words means more room for art direction and higher typography quality. The ONLY text on the image is: the sale label, the headline, the property address, the price, the agent name, the phone, and the supplied branding. But minimal text does NOT mean a bare photo with a caption — the reduced text must be set as DESIGNED, editorial typography that is part of the composition. NEVER render feature paragraphs, specification rows, bullet lists, spec tables, or feature icons — property facts are omitted from the image entirely.",

    // ── NO SPECIFICATION STRIP (user mandate) ─────────────────────────────────
    "NO FEATURE / SPECIFICATION STRIP: do NOT render any feature icon row, specification row, property-facts section, feature table, or spec icons inside the image — the AI struggles to render icons + numbers cleanly, and they make the ad feel like a brochure spec sheet. Omit them entirely. If a property detail is truly important, weave it NATURALLY into the creative concept or the headline — never as a dedicated facts/icon strip. Property details are SECONDARY; the property photo is the hero. The ad must feel like a premium CAMPAIGN, not a specification sheet.",

    "BRAND INTEGRATION: use ONLY the supplied branding — never invent logos or colors, never replace branding. Branding must feel premium, understated and trustworthy; the logo is a trust signal, naturally integrated, never the hero.",
    "AGENT POSITIONING: present the agent as a trusted advisor / luxury consultant / private banker — elegant, trustworthy, never a salesperson and never dominant. The property remains the hero.",
    "HEBREW TYPOGRAPHY: perfect RTL, professional Hebrew typography resembling premium developer brochures, architectural publications and luxury magazines. No AI-looking, decorative, stretched or fake-luxury fonts. Hebrew spelling errors are unacceptable.",
    `BRAND COLOR SYSTEM — derive ALL typography colors from the supplied brand palette: ${colors}. ROLE MAPPING: the HEADLINE uses the PRIMARY brand color (on dark backgrounds use the brand's approved light text color — never generic white unless white is part of the brand); the PRICE uses the brand ACCENT color and must visually stand out from every other text element as the primary commercial element; the CTA uses a brand color and stays clearly readable; the AGENT NAME uses a secondary/muted brand tone; the property DETAILS use neutral tones only. Color hierarchy (most → least emphasis): headline → price → CTA → agent name → details.`,
    `BRAND LOCK — the supplied brand palette OVERRIDES all default styling. Use ONLY colors from the brand palette (${colors}). Do NOT introduce random gold, blue, cyan, orange, or random gradients unless those colors exist in the supplied palette. Never pick colors automatically or generate AI colors. The logo, headline, price, CTA and border colors are LOCKED to the brand palette. The ad must feel like it BELONGS to the brand — brand consistency outranks creative color choices.`,
    `ART DIRECTION: imagine a collaboration between Apple, Porsche, Architectural Digest and a luxury real-estate collection — the premium version of ${spec.logoText ?? "the supplied office brand"}. The final image must feel expensive, clean, architectural, editorial and aspirational. Brand personality: ${spec.brandPersonality ?? "premium professional"}.`,
    // ── LUXURY ART DIRECTION (developer-campaign brief) ───────────────────────
    "LUXURY LAYOUT: a vertical premium poster. A LARGE hero property photo occupies the upper section; below it, ELEGANT FLOATING INFORMATION PANELS (glassy, soft shadows) hold the headline, price and details. Sophisticated visual hierarchy, a clean grid, and lots of breathing space — minimalistic yet high-converting, high-end magazine quality.",
    "LUXURY DESIGN ELEMENTS: a large bold Hebrew headline; the price displayed inside a premium FLOATING CARD; property features as luxury LINE ICONS (never text rows); elegant separators; restrained modern geometric shapes; thin BRAND-ACCENT lines (use the brand accent color, not a default gold); subtle glass effects; premium gradient overlays in brand tones; refined luxury-brochure styling.",
    "PREMIUM CLEANUP (refinement pass, NOT a redesign): reduce decorative/accent line work by ~20% versus a typical luxury layout — fewer thin lines, more restraint and breathing space. KEEP unchanged: the current composition, the visual hierarchy, the typography hierarchy, the agent placement and the supplied branding. This is a cleanup, not a layout change.",
    // ── ZONO SIGNATURE DESIGN LANGUAGE (recognizable across every creative) ──
    "ZONO SIGNATURE DESIGN LANGUAGE — every creative must carry a recognizable ZONO visual signature so the brand is felt BEFORE the logo is read. This signature is NOT the logo, text, price, agent or CTA — it is a premium VISUAL SYSTEM. Apply a consistent, restrained set of these motifs: a subtle architectural FRAME around the composition; fine editorial LINE WORK; a soft luxury GLASS PANEL holding the key copy; layered DEPTH (foreground frame → property → atmospheric background); a refined premium GRADIENT treatment; magazine-inspired composition with intentional negative space; and a quiet geometric corner motif. The signature must be ELEGANT and understated — never flashy, never Canva, never a template, and it must NEVER overpower the property (the property is always the hero). Keep these motifs CONSISTENT in feel and placement from creative to creative so the ZONO style becomes instantly recognizable across all ads.",
    "AGENT SECTION: integrate the professional realtor portrait naturally into the composition with a premium contact block — luxury personal-branding feel, never a sticker, never dominant over the property.",
    "REFERENCE FEEL: RE/MAX Luxury Collection, a Dubai luxury real-estate campaign, high-end residential development marketing, an architectural-magazine cover, a premium property-investment brochure.",
    "RENDERING: ultra-realistic, photorealistic, high-end interior photography, natural daylight, luxury atmosphere, 8K quality, premium marketing design.",
    "AVOID: cheap flyer design, crowded layouts, generic real-estate ads, stock-template looks, overused/cartoon icons, and colorful distractions.",
    "FORBIDDEN — reject the design if it resembles a Canva template, a Wix template, a generic real-estate card, a cheap Facebook ad, an AI-generated poster, or franchise marketing.",
    "APPROVE ONLY IF the result resembles an architectural-magazine cover, a luxury developer campaign, a premium property brochure, or a high-end real-estate launch campaign.",
    "OUTPUT: a fully designed advertisement using all supplied assets, with exact branding, exact agent identity and exact contact details — suitable for Facebook, Instagram, LinkedIn and premium digital advertising. Vertical 4:5 format. Quality target 10/10, no compromises.",
    "TECHNICAL LOCK (non-negotiable): do NOT alter the logo or the agent's face; numbers and phone digits must be exact; render nothing beyond the locked copy above.",
    correction ? `CORRECTION (previous attempt failed QA — fix ONLY these issues inside this same AI generation, keeping the same visual direction):\n${correction}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export interface RawImage { b64: string; mime: string }

async function fetchBlob(url: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/jpeg";
    const buf = await r.arrayBuffer();
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    return { blob: new Blob([buf], { type }), name: `ref.${ext}` };
  } catch { return null; }
}

/** Per-image generation timeout (ms). Prevents a hung OpenAI call from stalling
 *  the whole flow — on timeout the request aborts and throws, so the attempt
 *  loop retries or falls back to the deterministic renderer. */
const IMAGE_TIMEOUT_MS = Math.max(20_000, Number(process.env.ZONO_CREATIVE_IMAGE_TIMEOUT_MS) || 75_000);

/** Raw gpt-image-1 multi-image edit → finished ad. Throws on no-key / API error / timeout. */
export async function generateAdImageRaw(prompt: string, refUrls: string[]): Promise<RawImage> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY חסר");
  const form = new FormData();
  form.append("model", IMAGE_MODEL()); form.append("prompt", prompt);
  // Vertical 4:5 social poster (closest gpt-image-1 portrait size to 1080×1350).
  form.append("size", process.env.ZONO_CREATIVE_IMAGE_SIZE || "1024x1536"); form.append("quality", "high"); form.append("n", "1");
  let attached = 0;
  for (const url of refUrls) { const f = await fetchBlob(url); if (f) { form.append("image[]", f.blob, f.name); attached++; } }
  if (!attached) throw new Error("no reference images could be fetched");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`OpenAI edits timed out after ${Math.round(IMAGE_TIMEOUT_MS / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) { const body = await res.text().catch(() => ""); throw new Error(`OpenAI edits failed (${res.status}) ${body.slice(0, 300)}`); }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return { b64, mime: "image/png" };
}

/** Vision read-back (OCR + per-field detection + sub-scores + flags). The model
 *  only EXTRACTS; creative-qa.ts decides pass/fail. Never throws. */
export async function runCreativeQA(b64: string, m: SourceManifest, assets: AdGenAssets): Promise<QaVisionFindings | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const ask = `You are a strict QA reviewer for a Hebrew real-estate advertisement image. Extract what you SEE (do not assume) and answer ONLY with JSON:
{"ocrText": "<all visible text, line by line>",
 "detectedSaleLabel": "", "detectedHeadline": "", "detectedPhone": "", "detectedPrice": "", "detectedAgentName": "", "detectedCity": "", "detectedStreet": "",
 "saleLabelLargeAndClear": bool, "addressHighlyVisible": bool,
 "brokenHebrew": bool, "rtlOk": bool, "ctaReadable": bool, "croppedText": bool,
 "logoPresentAndCorrect": bool, "agentPhotoOkOrAbsent": bool, "distortedFaceOrLogo": bool,
 "scores": {"brand":0-100, "layout":0-100, "readability":0-100, "assetIntegrity":0-100, "realEstateRelevance":0-100}}
Expected (the ONLY allowed text): sale_label="${m.saleLabel}", headline="${m.headline}", address="${m.address ?? "—"}", phone="${m.phone ?? "—"}", price="${m.price ?? "—"}", agent="${m.agentName ?? "—"}", city="${m.city ?? "—"}", cta="${m.cta}". saleLabelLargeAndClear=true ONLY if the word "${m.saleLabel}" appears LARGE, clear and prominent (a premium headline badge). addressHighlyVisible=true ONLY if the address ${m.address ? `"${m.address}"` : "(if present)"} appears clearly and prominently — set true when no address is expected. A logo is ${assets.logoUrl ? "expected" : "NOT expected (set logoPresentAndCorrect=true)"}; an agent photo is ${assets.agentPhoto ? "expected" : "NOT expected (set agentPhotoOkOrAbsent=true)"}. brokenHebrew=true if ANY Hebrew is fake/garbled/misspelled. Read carefully — digits and Hebrew spelling matter.`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: VISION_MODEL(), temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [
          { type: "text", text: ask },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ] }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const txt = json?.choices?.[0]?.message?.content; if (!txt) return null;
    const v = JSON.parse(txt) as Record<string, unknown>;
    const sc = (v.scores ?? {}) as Record<string, unknown>;
    const num = (x: unknown) => Math.max(0, Math.min(100, Number(x) || 0));
    const str = (x: unknown) => (typeof x === "string" ? x : null);
    return {
      ocrText: String(v.ocrText ?? ""),
      detectedSaleLabel: str(v.detectedSaleLabel),
      detectedHeadline: str(v.detectedHeadline), detectedPhone: str(v.detectedPhone), detectedPrice: str(v.detectedPrice),
      detectedAgentName: str(v.detectedAgentName), detectedCity: str(v.detectedCity), detectedStreet: str(v.detectedStreet),
      saleLabelLargeAndClear: Boolean(v.saleLabelLargeAndClear), addressHighlyVisible: Boolean(v.addressHighlyVisible),
      brokenHebrew: Boolean(v.brokenHebrew), rtlOk: Boolean(v.rtlOk), ctaReadable: Boolean(v.ctaReadable), croppedText: Boolean(v.croppedText),
      logoPresentAndCorrect: Boolean(v.logoPresentAndCorrect), agentPhotoOkOrAbsent: Boolean(v.agentPhotoOkOrAbsent), distortedFaceOrLogo: Boolean(v.distortedFaceOrLogo),
      scores: { textAccuracy: 0, numericAccuracy: 0, brand: num(sc.brand), layout: num(sc.layout), readability: num(sc.readability), assetIntegrity: num(sc.assetIntegrity), realEstateRelevance: num(sc.realEstateRelevance), overall: 0 },
    };
  } catch { return null; }
}

export interface CreativeFindings { scores: CreativeScores; hardFails: CreativeHardFails; proudToPublish: boolean; notes: string }

/** LAYER 2 — Creative Director evaluation (DESIRABILITY). Judges the image as a
 *  top Israeli real-estate marketer / Meta ads strategist / premium branding
 *  expert against the bar of leading brokers & developers. Never throws. */
export async function runCreativeDirectorQA(b64: string): Promise<CreativeFindings | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const ask = `You are simultaneously a TOP Israeli real-estate marketing designer, a top Meta ads creative strategist, and a premium branding expert. Judge this real-estate ad image for DESIRABILITY (not correctness) against the bar of premium ads from leading Israeli brokers and developers. Reject generic / boring / weak / cluttered / AI-looking / Canva-looking / amateur / outdated / low-converting work. Answer ONLY with JSON:
{"scores": {"visualImpact":0-100,"realEstateCredibility":0-100,"premiumFeeling":0-100,"brandConsistency":0-100,"conversionPotential":0-100,"typographyQuality":0-100,"layoutQuality":0-100,"imageComposition":0-100,"overallWow":0-100},
 "hardFails": {"propertyImageTooSmall":bool,"textDominatesProperty":bool,"priceNotDominant":bool,"weakHierarchy":bool,"uglyCollage":bool,"excessiveEmptySpace":bool,"excessiveClutter":bool,"looksAiGenerated":bool,"notProfessionalAd":bool},
 "proudToPublish": bool, "notes":"one-line: what holds it back"}
proudToPublish = would a LEADING real-estate marketer proudly publish this tomorrow? Be strict — only true premium agency-grade work passes.`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: VISION_MODEL(), temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [
          { type: "text", text: ask },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ] }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const txt = json?.choices?.[0]?.message?.content; if (!txt) return null;
    const v = JSON.parse(txt) as Record<string, unknown>;
    const sc = (v.scores ?? {}) as Record<string, unknown>;
    const hf = (v.hardFails ?? {}) as Record<string, unknown>;
    const num = (x: unknown) => Math.max(0, Math.min(100, Number(x) || 0));
    const b = (x: unknown) => Boolean(x);
    return {
      scores: { visualImpact: num(sc.visualImpact), realEstateCredibility: num(sc.realEstateCredibility), premiumFeeling: num(sc.premiumFeeling), brandConsistency: num(sc.brandConsistency), conversionPotential: num(sc.conversionPotential), typographyQuality: num(sc.typographyQuality), layoutQuality: num(sc.layoutQuality), imageComposition: num(sc.imageComposition), overallWow: num(sc.overallWow) },
      hardFails: { propertyImageTooSmall: b(hf.propertyImageTooSmall), textDominatesProperty: b(hf.textDominatesProperty), priceNotDominant: b(hf.priceNotDominant), weakHierarchy: b(hf.weakHierarchy), uglyCollage: b(hf.uglyCollage), excessiveEmptySpace: b(hf.excessiveEmptySpace), excessiveClutter: b(hf.excessiveClutter), looksAiGenerated: b(hf.looksAiGenerated), notProfessionalAd: b(hf.notProfessionalAd) },
      proudToPublish: b(v.proudToPublish), notes: String(v.notes ?? "").slice(0, 300),
    };
  } catch { return null; }
}
