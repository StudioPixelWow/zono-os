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
