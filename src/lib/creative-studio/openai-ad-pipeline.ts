// ============================================================================
// ZONO — OpenAI Creative GENERATION Pipeline (server-only)
// ----------------------------------------------------------------------------
// The image model is the DESIGNER. We send the real assets (property photo(s),
// agency logo, agent photo) as reference images plus a full art-direction brief
// (headline / price / phone / CTA / features / brand colours / concept), and
// gpt-image-1 returns the COMPLETE finished advertisement — logo, agent,
// property, text, hierarchy and composition already baked in.
//
// There is NO renderer composition here. A Vision-QA gate reads the result back
// (legibility, phone/price/logo/agent correctness) and retries with a sharpened
// prompt; if it still fails — or no OpenAI key — the caller falls back to the
// deterministic renderer. ZONO only displays the returned image.
// ============================================================================
import "server-only";
import { resolveImageProvider } from "./visual-providers";
import type { FinalAdData } from "./final-creative-engine";

const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const VISION_MODEL = () => process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
const MAX_ATTEMPTS = 3;        // 1 initial + 2 retries
const QA_PASS = 82;            // min vision score to ship without fallback

export interface AdGenAssets { propertyImages: string[]; logoUrl: string | null; agentPhoto: string | null }
export interface VisionVerdict {
  score: number; legible: boolean; phoneOk: boolean; priceOk: boolean;
  logoPresent: boolean; agentPresent: boolean; gibberish: boolean; notes: string;
}
export interface AdGenResult {
  status: "ai_full_ad" | "no_provider" | "failed";
  b64?: string; mime?: string; prompt: string; provider: string; attempts: number;
  qa?: VisionVerdict; error?: string;
}

/** Build the full art-direction brief. The model renders EVERYTHING — we only
 *  describe placement + the exact Hebrew copy + brand colours + concept. */
function buildAdPrompt(ad: FinalAdData, assets: AdGenAssets, attempt: number, correction: string): string {
  const pal = ad.palette;
  const colors = [pal.bg, pal.bg2, pal.accent].filter(Boolean).join(", ");
  const feats = ad.features.map((f) => (f.value ? `${f.value} ${f.label}` : f.label)).filter(Boolean).join(" · ");
  // Reference-image legend (order matters; matches the order we upload them).
  const refs: string[] = [];
  const nImg = Math.min(assets.propertyImages.length, 3);
  for (let i = 0; i < nImg; i++) refs.push(`reference image ${refs.length + 1} = the REAL property photo${nImg > 1 ? ` (${i + 1}/${nImg})` : ""} — this is the HERO of the ad, keep it real and unaltered`);
  if (assets.logoUrl) refs.push(`reference image ${refs.length + 1} = the agency LOGO — reproduce it EXACTLY (do not redraw, recolor or distort), place it small in a top corner`);
  if (assets.agentPhoto) refs.push(`reference image ${refs.length + 1} = the AGENT headshot — keep the face unaltered, place it SMALL in a bottom corner (trust element only, never dominant)`);

  const lines = [
    `Design a COMPLETE, finished real-estate ADVERTISEMENT — 1:1 square (1024×1024), magazine / premium-agency quality. Concept: ${ad.triggerLabel}.`,
    `Reference images provided: ${refs.join("; ")}.`,
    `The property photo must dominate (~70% visual weight). Visual hierarchy top→bottom: property → headline → price → call-to-action → features → agent (small) → logo.`,
    `Render this EXACT Hebrew copy as crisp, perfectly legible right-to-left (RTL) typography — no gibberish, no invented or broken letters:`,
    `• Headline: "${ad.headline}"`,
    ad.subheadline ? `• Sub-headline: "${ad.subheadline}"` : "",
    ad.price ? `• Price: "${ad.priceLabel} ${ad.price}"` : "",
    feats ? `• Features: "${feats}"` : "",
    ad.cta ? `• Call to action button: "${ad.cta}"` : "",
    ad.agentName ? `• Agent name: "${ad.agentName}"` : "",
    ad.agentPhone ? `• Phone (Latin digits, LTR): "${ad.agentPhone}"` : "",
    `Brand colour palette (use as the design system): ${colors}.`,
    `Art direction: premium, cinematic, ${ad.artDirection?.emotionalFeel ?? "confident and aspirational"}; ${ad.artDirection?.visualStory ?? "a real-estate campaign, not a template or CRM card"}.`,
    `Absolute rules: do NOT invent property features or rooms; do NOT alter the supplied logo or agent face; every Hebrew word must be spelled exactly as given and fully legible. Output a single finished ad image.`,
    correction ? `IMPORTANT — the previous attempt failed quality review for: ${correction}. Fix these specifically: make all Hebrew text perfectly legible and correctly spelled, keep the logo and agent exact, and ensure the phone number reads exactly "${ad.agentPhone ?? ""}".` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

async function fetchBlob(url: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/jpeg";
    const buf = await r.arrayBuffer();
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    return { blob: new Blob([buf], { type }), name: `ref.${ext}` };
  } catch { return null; }
}

/** gpt-image-1 multi-image edit → finished ad. Throws on no-key / API error. */
async function callEdits(prompt: string, refUrls: string[]): Promise<{ b64: string; mime: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY חסר");
  const form = new FormData();
  form.append("model", IMAGE_MODEL());
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("quality", "high");
  form.append("n", "1");
  let attached = 0;
  for (const url of refUrls) {
    const f = await fetchBlob(url);
    if (f) { form.append("image[]", f.blob, f.name); attached++; }
  }
  if (!attached) throw new Error("no reference images could be fetched");
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { authorization: `Bearer ${key}` }, body: form,
  });
  if (!res.ok) { const body = await res.text().catch(() => ""); throw new Error(`OpenAI edits failed (${res.status}) ${body.slice(0, 300)}`); }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return { b64, mime: "image/png" };
}

/** Vision-QA: read the generated ad back and score legibility + accuracy. */
async function visionQa(b64: string, ad: FinalAdData, assets: AdGenAssets): Promise<VisionVerdict> {
  const key = process.env.OPENAI_API_KEY;
  const fallback: VisionVerdict = { score: 0, legible: false, phoneOk: false, priceOk: false, logoPresent: false, agentPresent: false, gibberish: true, notes: "QA unavailable" };
  if (!key) return fallback;
  const ask = `You are a strict QA reviewer for a Hebrew real-estate advertisement. Inspect the image and answer ONLY with JSON:
{"legible":bool, "gibberish":bool, "phoneOk":bool, "priceOk":bool, "logoPresent":bool, "agentPresent":bool, "score":0-100, "notes":"short"}
Check: is ALL Hebrew text real, correctly spelled and legible (gibberish=true if any fake/broken letters)? Does it show the phone "${ad.agentPhone ?? "—"}" exactly? Does it show the price "${ad.price ?? "—"}"? Is a logo present${assets.logoUrl ? "" : " (none expected)"}? Is the agent photo present and small${assets.agentPhoto ? "" : " (none expected)"}? score = overall ad quality + text correctness.`;
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
    if (!res.ok) return fallback;
    const json = await res.json();
    const txt = json?.choices?.[0]?.message?.content;
    if (!txt) return fallback;
    const v = JSON.parse(txt) as Partial<VisionVerdict>;
    return {
      score: Number(v.score) || 0, legible: Boolean(v.legible), phoneOk: Boolean(v.phoneOk), priceOk: Boolean(v.priceOk),
      logoPresent: Boolean(v.logoPresent), agentPresent: Boolean(v.agentPresent), gibberish: Boolean(v.gibberish), notes: String(v.notes ?? "").slice(0, 300),
    };
  } catch { return fallback; }
}

function passes(qa: VisionVerdict, ad: FinalAdData): boolean {
  if (qa.score < QA_PASS || !qa.legible || qa.gibberish) return false;
  if (ad.agentPhone && !qa.phoneOk) return false;
  if (ad.price && !qa.priceOk) return false;
  return true;
}

/** Generate the FINISHED ad with gpt-image-1 + Vision-QA + retry. Never throws. */
export async function generateFinalAdImage(ad: FinalAdData, assets: AdGenAssets): Promise<AdGenResult> {
  const info = resolveImageProvider();
  // Full-ad generation is an OpenAI-only capability (multi-image edits + in-image text).
  if (info.provider !== "openai") {
    return { status: "no_provider", prompt: "", provider: info.provider, attempts: 0, error: info.provider === "mock" ? info.reason : "full-ad generation requires ZONO_IMAGE_PROVIDER=openai" };
  }
  const refUrls = [...assets.propertyImages.slice(0, 3), assets.logoUrl, assets.agentPhoto].filter(Boolean) as string[];
  if (!refUrls.length) return { status: "failed", prompt: "", provider: "openai", attempts: 0, error: "no reference assets" };

  let correction = ""; let attempts = 0; let lastErr = ""; let best: { img: { b64: string; mime: string }; qa: VisionVerdict; prompt: string } | null = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++;
    const prompt = buildAdPrompt(ad, assets, i, correction);
    try {
      const img = await callEdits(prompt, refUrls);
      const qa = await visionQa(img.b64, ad, assets);
      if (!best || qa.score > best.qa.score) best = { img, qa, prompt };
      if (passes(qa, ad)) {
        return { status: "ai_full_ad", b64: img.b64, mime: img.mime, prompt, provider: `openai:${IMAGE_MODEL()}`, attempts, qa };
      }
      correction = qa.notes || "Hebrew legibility / asset accuracy";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  // Exhausted retries — surface the best attempt so the caller can decide
  // (ship best vs deterministic fallback). We report "failed" so the caller
  // applies the fallback per the approved architecture.
  return { status: "failed", b64: best?.img.b64, mime: best?.img.mime, prompt: best?.prompt ?? "", provider: `openai:${IMAGE_MODEL()}`, attempts, qa: best?.qa, error: lastErr || "did not pass Vision-QA after retries" };
}
