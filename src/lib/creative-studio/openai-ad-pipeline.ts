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

/** Source-Data Lock: the manifest is the ONLY text the ad may contain. */
export function buildSourceManifest(spec: AdSpec): SourceManifest {
  return {
    headline: spec.headline, subheadline: spec.subheadline ?? null,
    price: spec.price ?? null,
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
 *  COMPLETE, finished premium campaign image. Only the dynamic values, the EXACT
 *  Hebrew copy, the supplied-asset map and the QA correction change per request;
 *  the creative doctrine below is constant for every generation. */
export function buildAdPrompt(spec: AdSpec, assets: AdGenAssets, correction: string): string {
  const colors = [spec.palette.bg, spec.palette.bg2, spec.palette.accent].filter(Boolean).join(", ");
  const feats = spec.features.filter(Boolean).join(" · ");
  const location = [spec.street, spec.city].filter(Boolean).join(", ");
  const priceLine = [spec.priceLabel, spec.price].filter(Boolean).join(" ").trim();

  // Supplied-asset map so the model knows which reference image is which.
  const refs: string[] = [];
  const nImg = Math.min(assets.propertyImages.length, 4);
  for (let i = 0; i < nImg; i++) refs.push(`reference image ${refs.length + 1} = REAL property photo ${i + 1}/${nImg} — keep photorealistic & unaltered, never redesign the building`);
  if (assets.logoUrl) refs.push(`reference image ${refs.length + 1} = the OFFICIAL OFFICE LOGO — reproduce EXACTLY; never redraw, recolor, distort or invent`);
  if (assets.agentPhoto) refs.push(`reference image ${refs.length + 1} = the AGENT photo — use EXACTLY; never regenerate, stylize, alter or replace the face`);

  // Creative brief assembled from the supplied property context.
  const brief = [
    spec.visualStory,
    spec.emotionalFeel,
    spec.propertyType ? `property character: ${spec.propertyType}` : "",
    feats ? `key details: ${feats}` : "",
    location ? `location: ${location}` : "",
  ].filter(Boolean).join(" — ") || "premium residential property";

  const kindLine =
    spec.kind === "sold"
      ? "Campaign type: a proud yet understated 'נמכר / JUST SOLD' announcement — celebratory and elegant; the נמכר treatment is tasteful, never a loud sticker."
      : spec.kind === "testimonial"
        ? "Campaign type: a warm client-testimonial campaign — trust-led, with the property still the hero behind an elegant quote."
        : "Campaign type: a lifestyle acquisition campaign for a property on the market.";

  const lines = [
    'ZONO PREMIUM REAL ESTATE CREATIVE ENGINE — create a premium real-estate ADVERTISING CAMPAIGN image. This is NOT a property listing, NOT a sales flyer, NOT a Facebook card. Create a LIFESTYLE ACQUISITION CAMPAIGN. The viewer must feel "I want to live there" BEFORE they think "this property is for sale". Sell emotion before information, atmosphere before specifications, ownership before features.',
    kindLine,
    `Concept: ${spec.conceptLabel}. Property brief: ${brief}.`,
    refs.length ? `SUPPLIED ASSETS — ${refs.join("; ")}. Use ALL supplied assets; never invent or substitute any of them.` : "",
    "PROPERTY HERO RULE: the property is the hero. Property photography occupies ~70–80% of the composition. Nothing may visually overpower or compete with the property — no oversized text, no giant logos, no aggressive overlays, no marketing gimmicks. Treat the property image like a luxury architectural-magazine cover.",
    "VISUAL STORYTELLING: respect architecture, composition, interior design, lighting and depth. Do not cover important rooms or block architectural features. Do not place text over focal areas. Let the property breathe and create desire through atmosphere.",
    // EXACT COPY LOCK — the only text allowed on the image.
    "Render ONLY this EXACT Hebrew copy, crisp and perfectly legible right-to-left (RTL), spelled exactly as given — no gibberish, no invented/broken/duplicated letters, nothing added, translated or shortened:",
    `• Headline: "${spec.headline}"`,
    spec.subheadline ? `• Sub-headline: "${spec.subheadline}"` : "",
    priceLine ? `• Price / offer (confident, premium, never shouty): "${priceLine}"` : "",
    feats ? `• A few key details (quiet, secondary): "${feats}"` : "",
    spec.cta ? `• CTA (refined, low-noise): "${spec.cta}"` : "",
    spec.agentName ? `• Agent name: "${spec.agentName}"` : "",
    spec.agentPhone ? `• Phone (Latin digits, keep LTR): "${spec.agentPhone}"` : "",
    spec.logoText ? `• Office name: "${spec.logoText}"` : "",
    location ? `• Location (subtle): "${location}"` : "",
    "BRAND INTEGRATION: use ONLY the supplied branding — never invent logos or colors, never replace branding. Branding must feel premium, understated and trustworthy; the logo is a trust signal, naturally integrated, never the hero.",
    "AGENT POSITIONING: present the agent as a trusted advisor / luxury consultant / private banker — elegant, trustworthy, never a salesperson and never dominant. The property remains the hero.",
    "PHONE VISIBILITY: the phone number must be impossible to miss yet never promotional — premium visibility, high trust, low noise, quiet confidence. Avoid 'SALE', 'CALL NOW' and flashy CTAs.",
    "HEBREW TYPOGRAPHY: perfect RTL, professional Hebrew typography resembling premium developer brochures, architectural publications and luxury magazines. No AI-looking, decorative, stretched or fake-luxury fonts.",
    `BRAND COLOR SYSTEM: use ONLY these brand colors — ${colors}. Apply them elegantly through dividers, small accents, headline emphasis, the phone section and micro-details. Never overwhelm the property; never create visual noise.`,
    `ART DIRECTION: imagine a collaboration between Apple, Porsche, Architectural Digest and a luxury real-estate collection — the premium version of ${spec.logoText ?? "the supplied office brand"}. The final image must feel expensive, clean, architectural, editorial and aspirational. Brand personality: ${spec.brandPersonality ?? "premium professional"}.`,
    "FORBIDDEN — reject the design if it resembles a Canva template, a Wix template, a generic real-estate card, a cheap Facebook ad, an AI-generated poster, or franchise marketing.",
    "APPROVE ONLY IF the result resembles an architectural-magazine cover, a luxury developer campaign, a premium property brochure, or a high-end real-estate launch campaign.",
    "OUTPUT: a fully designed advertisement using all supplied assets, with exact branding, exact agent identity and exact contact details — suitable for Facebook, Instagram, LinkedIn and premium digital advertising. Vertical 4:5 format. Quality target 10/10, no compromises.",
    "TECHNICAL LOCK (non-negotiable): do NOT alter the logo or the agent's face; numbers and phone digits must be exact; render nothing beyond the copy above.",
    correction ? `CORRECTION (previous attempt failed QA — fix precisely):\n${correction}` : "",
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
 "detectedHeadline": "", "detectedPhone": "", "detectedPrice": "", "detectedAgentName": "", "detectedCity": "", "detectedStreet": "",
 "brokenHebrew": bool, "rtlOk": bool, "ctaReadable": bool, "croppedText": bool,
 "logoPresentAndCorrect": bool, "agentPhotoOkOrAbsent": bool, "distortedFaceOrLogo": bool,
 "scores": {"brand":0-100, "layout":0-100, "readability":0-100, "assetIntegrity":0-100, "realEstateRelevance":0-100}}
Expected (the ONLY allowed text): headline="${m.headline}", phone="${m.phone ?? "—"}", price="${m.price ?? "—"}", agent="${m.agentName ?? "—"}", city="${m.city ?? "—"}", cta="${m.cta}". A logo is ${assets.logoUrl ? "expected" : "NOT expected (set logoPresentAndCorrect=true)"}; an agent photo is ${assets.agentPhoto ? "expected" : "NOT expected (set agentPhotoOkOrAbsent=true)"}. brokenHebrew=true if ANY Hebrew is fake/garbled/misspelled. Read carefully — digits and Hebrew spelling matter.`;
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
      detectedHeadline: str(v.detectedHeadline), detectedPhone: str(v.detectedPhone), detectedPrice: str(v.detectedPrice),
      detectedAgentName: str(v.detectedAgentName), detectedCity: str(v.detectedCity), detectedStreet: str(v.detectedStreet),
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
