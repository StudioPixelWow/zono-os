// ============================================================================
// ZONO — Visual provider layer (server-side)
// ----------------------------------------------------------------------------
// mock (deterministic SVG, no key) | gemini (Imagen) | openai (images).
// Default mock when no key. Returns either a ready data URL (mock) or raw
// base64 bytes (real → uploaded to storage by the service). Keys server-side.
// ============================================================================
import "server-only";
import type { VisualDNA } from "../visual-dna";

export interface VisualGenInput {
  visualType: string; entityName: string; prompt: string; vdna: VisualDNA; aspect: "portrait" | "square" | "landscape";
}
export type VisualGenResult =
  | { kind: "dataurl"; dataUrl: string; provider: string }
  | { kind: "bytes"; b64: string; mime: string; provider: string };

function activeMode(): { mode: "gemini" | "openai" | "mock"; key: string } {
  const choice = (process.env.VISUAL_PROVIDER || process.env.ZONO_MARKETING_ANALYSIS_PROVIDER || "").toLowerCase();
  const gemini = process.env.GEMINI_API_KEY || "";
  const openai = process.env.OPENAI_API_KEY || "";
  if (choice === "mock") return { mode: "mock", key: "" };
  if (choice === "gemini" && gemini) return { mode: "gemini", key: gemini };
  if (choice === "openai" && openai) return { mode: "openai", key: openai };
  if (gemini) return { mode: "gemini", key: gemini };
  if (openai) return { mode: "openai", key: openai };
  return { mode: "mock", key: "" };
}

// ── mock: deterministic SVG "image" from Visual DNA palette ────────────────────
function mockVisual(i: VisualGenInput): VisualGenResult {
  const pal = i.vdna.palette.length >= 2 ? i.vdna.palette : i.vdna.luxuryLevel >= 65 ? ["#0F3D2E", "#0A2A20", "#C9A14A"] : ["#5B21B6", "#7C3AED", "#FBBF24"];
  const [c1, c2, accent] = [pal[0], pal[1] ?? pal[0], pal[2] ?? "#FBBF24"];
  const dims = i.aspect === "portrait" ? { w: 1080, h: 1350 } : i.aspect === "landscape" ? { w: 1200, h: 628 } : { w: 1080, h: 1080 };
  const label = i.visualType;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.w}" height="${dims.h}" viewBox="0 0 ${dims.w} ${dims.h}">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#g)"/>`
    + `<circle cx="${dims.w * 0.78}" cy="${dims.h * 0.22}" r="${dims.w * 0.16}" fill="${accent}" opacity="0.18"/>`
    + `<rect x="${dims.w * 0.1}" y="${dims.h * 0.62}" width="${dims.w * 0.55}" height="14" rx="7" fill="${accent}" opacity="0.85"/>`
    + `<rect x="${dims.w * 0.1}" y="${dims.h * 0.68}" width="${dims.w * 0.38}" height="10" rx="5" fill="#ffffff" opacity="0.6"/>`
    + `<text x="${dims.w / 2}" y="${dims.h * 0.45}" fill="#ffffff" opacity="0.92" font-family="Arial" font-size="${dims.w * 0.05}" font-weight="bold" text-anchor="middle">ZONO · ${label}</text>`
    + `<text x="${dims.w / 2}" y="${dims.h * 0.51}" fill="#ffffff" opacity="0.55" font-family="Arial" font-size="${dims.w * 0.028}" text-anchor="middle">visual mockup (no provider key)</text>`
    + `</svg>`;
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return { kind: "dataurl", dataUrl, provider: "mock" };
}

async function openaiVisual(key: string, i: VisualGenInput): Promise<VisualGenResult> {
  const size = i.aspect === "portrait" ? "1024x1536" : i.aspect === "landscape" ? "1536x1024" : "1024x1024";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.ZONO_OPENAI_IMAGE_MODEL || "gpt-image-1", prompt: i.prompt, size, n: 1 }),
  });
  if (!res.ok) throw new Error(`OpenAI image failed (${res.status})`);
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return { kind: "bytes", b64, mime: "image/png", provider: "openai" };
}

async function geminiVisual(key: string, i: VisualGenInput): Promise<VisualGenResult> {
  const model = process.env.ZONO_GEMINI_IMAGE_MODEL || "imagen-3.0-generate-002";
  const ar = i.aspect === "portrait" ? "3:4" : i.aspect === "landscape" ? "16:9" : "1:1";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt: i.prompt }], parameters: { sampleCount: 1, aspectRatio: ar } }),
  });
  if (!res.ok) throw new Error(`Gemini image failed (${res.status})`);
  const json = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Gemini returned no image");
  return { kind: "bytes", b64, mime: "image/png", provider: "gemini" };
}

/** Generate a visual. Never throws — falls back to the mock SVG on any error / no key. */
export async function generateVisual(i: VisualGenInput): Promise<VisualGenResult> {
  const { mode, key } = activeMode();
  if (mode === "mock") return mockVisual(i);
  try {
    return mode === "gemini" ? await geminiVisual(key, i) : await openaiVisual(key, i);
  } catch {
    return mockVisual(i);
  }
}

// ── Nano Banana (Gemini 2.5 Flash Image) — text+image → final composed image ──
export interface NanoBananaResult { b64: string; mime: string; provider: string }
export function nanoBananaConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Fetch an image URL server-side and return inline base64 (for reference photo). */
async function fetchImageInline(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimeType, data: buf.toString("base64") };
  } catch { return null; }
}

// Candidate image models, tried in order. The GA name is `gemini-2.5-flash-image`
// (the `-preview` alias was retired); older keys may only expose the 2.0 model.
function nanoBananaModels(): string[] {
  const override = process.env.ZONO_NANO_BANANA_MODEL;
  const defaults = ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview", "gemini-2.0-flash-preview-image-generation"];
  return override ? [override, ...defaults.filter((m) => m !== override)] : defaults;
}

async function callNanoBananaModel(model: string, key: string, parts: Record<string, unknown>[]): Promise<NanoBananaResult | { notFound: true; status: number; body: string }> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    // IMAGE generation via generateContent REQUIRES responseModalities, else the
    // model returns text only and no image is produced.
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 404 / NOT_FOUND → this model id isn't available on the key; let caller try next.
    if (res.status === 404) return { notFound: true, status: res.status, body: body.slice(0, 200) };
    // 429 → quota/billing, not transient: surface a clear, actionable message.
    if (res.status === 429) throw new Error("מכסת ה-API של Gemini נוצלה. כדי לייצר תמונות יש להפעיל חיוב (billing) בחשבון Google AI — gemini-2.5-flash-image הוא מודל בתשלום ולא נכלל בתוכנית החינמית.");
    throw new Error(`Nano Banana failed (${res.status}) model=${model} ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const outParts = json?.candidates?.[0]?.content?.parts ?? [];
  const img = outParts.find((p: Record<string, unknown>) => (p.inlineData as { data?: string } | undefined)?.data);
  const b64 = (img?.inlineData as { data?: string } | undefined)?.data;
  const mime = (img?.inlineData as { mimeType?: string } | undefined)?.mimeType || "image/png";
  if (!b64) {
    const finish = json?.candidates?.[0]?.finishReason ?? "";
    const txt = outParts.map((p: Record<string, unknown>) => p.text).filter(Boolean).join(" ").slice(0, 200);
    throw new Error(`Nano Banana לא החזיר תמונה (model=${model} finish=${finish}) ${txt}`);
  }
  return { b64, mime, provider: `nano-banana:${model}` };
}

/**
 * Generate a REAL finished ad image via Gemini Nano Banana. Tries the GA model
 * first and falls through on 404 to alternates, so it self-heals across API
 * versions. Throws when no key (caller surfaces a clear message — no fake image).
 */
export async function generateNanoBananaImage(prompt: string, referenceImageUrl?: string | null): Promise<NanoBananaResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY חסר — חבר ספק תמונות כדי לייצר תמונה סופית");

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (referenceImageUrl) {
    const ref = await fetchImageInline(referenceImageUrl);
    if (ref) parts.push({ inlineData: ref });
  }

  const models = nanoBananaModels();
  const tried: string[] = [];
  for (const model of models) {
    const r = await callNanoBananaModel(model, key, parts);
    if ("notFound" in r) { tried.push(`${model}(404)`); continue; }
    return r;
  }
  throw new Error(`Nano Banana failed (404) — no available image model. Tried: ${tried.join(", ")}. Set ZONO_NANO_BANANA_MODEL to a model your key supports (ListModels).`);
}

// ── Provider resolution for the FINAL ad image ─────────────────────────────────
// Honours ZONO_IMAGE_PROVIDER (gemini | openai | mock), then VISUAL_PROVIDER,
// then whichever key is present. "mock" / no-key never produces a fake image.
export interface ImageProviderInfo { provider: "gemini" | "openai" | "mock"; hasKey: boolean; reason: string }
export function resolveImageProvider(): ImageProviderInfo {
  const choice = (process.env.ZONO_IMAGE_PROVIDER || process.env.VISUAL_PROVIDER || "").toLowerCase();
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  if (choice === "mock") return { provider: "mock", hasKey: false, reason: "ZONO_IMAGE_PROVIDER=mock" };
  if (choice === "openai") return openai ? { provider: "openai", hasKey: true, reason: "ZONO_IMAGE_PROVIDER=openai" } : { provider: "mock", hasKey: false, reason: "ZONO_IMAGE_PROVIDER=openai but OPENAI_API_KEY missing" };
  if (choice === "gemini") return gemini ? { provider: "gemini", hasKey: true, reason: "ZONO_IMAGE_PROVIDER=gemini" } : { provider: "mock", hasKey: false, reason: "ZONO_IMAGE_PROVIDER=gemini but GEMINI_API_KEY missing" };
  if (gemini) return { provider: "gemini", hasKey: true, reason: "GEMINI_API_KEY present (default)" };
  if (openai) return { provider: "openai", hasKey: true, reason: "OPENAI_API_KEY present (default)" };
  return { provider: "mock", hasKey: false, reason: "no image provider key configured" };
}

/** Resolve the OpenAI image model: OPENAI_IMAGE_MODEL (canonical), then the
 *  legacy ZONO_OPENAI_IMAGE_MODEL alias, then gpt-image-1. */
function openaiImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL || process.env.ZONO_OPENAI_IMAGE_MODEL || "gpt-image-1";
}

/** OpenAI text-to-image (gpt-image-1), returning raw base64 bytes. Generates the
 *  cinematic ADVERTISING SCENE only — never any text/logo/face (the prompt's
 *  negative rules enforce this); real assets + Hebrew stay deterministic overlays. */
async function openaiImage(prompt: string, size = "1024x1536"): Promise<NanoBananaResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY חסר");
  const model = openaiImageModel();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size, n: 1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI image failed (${res.status}) model=${model} ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return { b64, mime: "image/png", provider: `openai:${model}` };
}

/**
 * Generate the FINAL ad image with the configured provider. Throws with a
 * `MOCK_PROVIDER:` prefix when no real provider is configured so the caller can
 * stamp a clear status — it never returns a fabricated image.
 */
export async function generateFinalImage(prompt: string, referenceImageUrl?: string | null, opts?: { size?: string }): Promise<NanoBananaResult> {
  const info = resolveImageProvider();
  if (info.provider === "mock") throw new Error(`MOCK_PROVIDER:${info.reason}`);
  // OpenAI gpt-image-1 is text-to-image: it generates the cinematic scene only
  // (no reference photo), so the real property photo is composited on top later.
  if (info.provider === "openai") return openaiImage(prompt, opts?.size);
  return generateNanoBananaImage(prompt, referenceImageUrl);
}
