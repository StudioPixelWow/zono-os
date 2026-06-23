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

const KIND_BRIEF: Record<AdKind, string> = {
  property: "a premium real-estate property ADVERTISEMENT",
  sold: "a celebratory 'JUST SOLD / נמכר' real-estate announcement (proud, congratulatory, clear נמכר/SOLD treatment over the property)",
  testimonial: "a client TESTIMONIAL / review ad (warm, trust-building; agent + quote lead, property photo secondary)",
};

export function refUrlsFor(assets: AdGenAssets): string[] {
  return [...assets.propertyImages.slice(0, 3), assets.logoUrl, assets.agentPhoto].filter(Boolean) as string[];
}

/** Full art-direction brief. The model renders EVERYTHING; we describe placement
 *  + the EXACT Hebrew copy + colours + concept. */
export function buildAdPrompt(spec: AdSpec, assets: AdGenAssets, correction: string): string {
  const colors = [spec.palette.bg, spec.palette.bg2, spec.palette.accent].filter(Boolean).join(", ");
  const feats = spec.features.filter(Boolean).join(" · ");
  const refs: string[] = [];
  const nImg = Math.min(assets.propertyImages.length, 3);
  const heroNote = spec.kind === "testimonial" ? "supporting/background photo" : "the HERO of the ad, keep it real and unaltered";
  for (let i = 0; i < nImg; i++) refs.push(`reference image ${refs.length + 1} = the REAL property photo${nImg > 1 ? ` (${i + 1}/${nImg})` : ""} — ${heroNote}`);
  if (assets.logoUrl) refs.push(`reference image ${refs.length + 1} = the agency LOGO — reproduce EXACTLY (no redraw/recolor/distort), small in a top corner`);
  if (assets.agentPhoto) refs.push(`reference image ${refs.length + 1} = the AGENT headshot — keep the face unaltered, ${spec.kind === "testimonial" ? "prominent trusted face" : "SMALL bottom corner"}`);
  const lines = [
    `Design a COMPLETE, finished ${KIND_BRIEF[spec.kind]} — 1:1 square (1024×1024), magazine / premium-agency quality. Concept: ${spec.conceptLabel}.`,
    refs.length ? `Reference images: ${refs.join("; ")}.` : "",
    spec.kind === "testimonial" ? "Hierarchy: quote + agent → headline → CTA → logo." : "The property photo dominates (~70%). Hierarchy: property → headline → price → CTA → features → agent (small) → logo.",
    "Render this EXACT Hebrew copy as crisp, perfectly legible right-to-left (RTL) typography — no gibberish, no invented/broken letters, spelled exactly as given:",
    `• Headline: "${spec.headline}"`,
    spec.subheadline ? `• Sub-headline: "${spec.subheadline}"` : "",
    spec.price ? `• Price: "${spec.priceLabel ?? "מחיר"} ${spec.price}"` : "",
    feats ? `• Features: "${feats}"` : "",
    spec.cta ? `• CTA button: "${spec.cta}"` : "",
    spec.agentName ? `• Agent name: "${spec.agentName}"` : "",
    spec.agentPhone ? `• Phone (Latin digits, LTR): "${spec.agentPhone}"` : "",
    spec.city || spec.street ? `• Location: "${[spec.street, spec.city].filter(Boolean).join(", ")}"` : "",
    `Brand colour palette: ${colors}. Art direction: premium, cinematic, ${spec.emotionalFeel ?? "confident"}.`,
    "Absolute rules: do NOT invent, translate, shorten or add any text beyond the copy above; do NOT alter the logo or agent face; numbers must be exact.",
    correction ? `CORRECTION (previous attempt failed QA):\n${correction}` : "",
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

/** Raw gpt-image-1 multi-image edit → finished ad. Throws on no-key / API error. */
export async function generateAdImageRaw(prompt: string, refUrls: string[]): Promise<RawImage> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY חסר");
  const form = new FormData();
  form.append("model", IMAGE_MODEL()); form.append("prompt", prompt);
  form.append("size", "1024x1024"); form.append("quality", "high"); form.append("n", "1");
  let attached = 0;
  for (const url of refUrls) { const f = await fetchBlob(url); if (f) { form.append("image[]", f.blob, f.name); attached++; } }
  if (!attached) throw new Error("no reference images could be fetched");
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
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
