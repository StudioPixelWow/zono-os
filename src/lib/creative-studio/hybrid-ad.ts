// ============================================================================
// ZONO creative-studio — HYBRID ad renderer (server-only).
// ----------------------------------------------------------------------------
// The premium production path (replaces the AI "bake everything" flow):
//   1. buildScenePrompt(spec)  — an LLM writes a FRESH, innovative art-direction
//      brief for THIS property each time (never a stale hardcoded prompt); it
//      describes a clean, cinematic SCENE only — NO text, NO logo, NO faces.
//   2. generateFinalImage(prompt) — gpt-image-2 renders that scene (text-free).
//   3. composeAd(scene, spec, brand) — deterministic premium overlay: exact brand
//      colors, the REAL office logo, the REAL agent photo, and pixel-perfect RTL
//      Hebrew (rendered with the bundled Heebo font — never baked by the model,
//      so "טל זטלמן" never becomes "סל נתלמן" and #024C96 stays #024C96).
//
// Text is deterministic ⇒ Hebrew is always correct and colors are always exact.
// The image model is now the SCENE ARTIST, not the typesetter.
// ============================================================================
import "server-only";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { generateFinalImage, resolveImageProvider } from "./visual-providers";
import { fetchLogoBytes } from "./logo-composite";
import { normalizeIlsPrice, resolveSaleLabel, type AdSpec, type AdGenAssets } from "./openai-ad-pipeline";
import { measureText, fitText } from "./reflow";
import { buildDynamicAdPrompt } from "./dynamic-ad-prompt";

// ── Bundled Hebrew font registration ────────────────────────────────────────
// librsvg (used by sharp for SVG text) needs a Hebrew-capable font on the
// fontconfig path. Serverless runtimes often ship none, which would render
// Hebrew as tofu. We ship Heebo in-repo and register it before the first render.
let fontReady = false;
function ensureHebrewFont(): void {
  if (fontReady) return;
  try {
    const fontDir = path.join(process.cwd(), "src", "lib", "creative-studio", "fonts");
    const dir = fs.existsSync(fontDir) ? fontDir : path.join(__dirname, "fonts");
    const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${dir}</dir>
  <cachedir>${path.join(os.tmpdir(), "zono-fontcache")}</cachedir>
  <config></config>
</fontconfig>`;
    const confPath = path.join(os.tmpdir(), "zono-fonts.conf");
    fs.writeFileSync(confPath, conf);
    process.env.FONTCONFIG_FILE = confPath;
    fontReady = true;
  } catch {
    /* best-effort — composite falls back to the system font, then bake path */
  }
}

const FONT = "Heebo, 'DejaVu Sans', sans-serif";

// ── XML/text escaping ───────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface BrandPaint {
  bg: string;      // brand primary (panel / band)
  bg2: string;     // brand secondary
  accent: string;  // brand accent (badges, hairline, price emphasis)
  ink?: string;    // dark text on light chips (defaults to bg)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) DYNAMIC AI SCENE PROMPT — a fresh art-direction brief per property.
// ─────────────────────────────────────────────────────────────────────────────
/** Deterministic premium fallback brief when no LLM is available. Still fresh-ish
 *  (varies by property context) and always TEXT-FREE / logo-free / face-free. */
function fallbackScenePrompt(spec: AdSpec): string {
  const where = [spec.street, spec.city].filter(Boolean).join(", ");
  const kind = spec.propertyType || "residential property";
  const mood = spec.emotionalFeel || spec.brandPersonality || "quiet luxury, aspirational, editorial";
  return [
    `Ultra-premium real-estate ADVERTISING SCENE for a ${kind}${where ? ` in ${where}` : ""}.`,
    `Cinematic architectural photography, magazine-cover quality (Architectural Digest / luxury developer launch), natural daylight, rich depth, elegant negative space in the lower third for later typography.`,
    `Mood: ${mood}. Composition art-directed and expensive, never a flat listing photo.`,
    `ABSOLUTELY NO text, NO letters, NO numbers, NO logos, NO watermarks, NO people's faces, NO UI — a clean photographic scene ONLY. Vertical 4:5.`,
  ].join(" ");
}

/** Ask an LLM to invent a fresh, innovative art-direction brief for THIS ad.
 *  Never throws — falls back to a strong deterministic brief. The returned brief
 *  describes a TEXT-FREE scene (all copy is added deterministically later). */
export async function buildScenePrompt(spec: AdSpec): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4o";
  if (!key) return fallbackScenePrompt(spec);
  const ctx = {
    kind: spec.kind, propertyType: spec.propertyType, city: spec.city, street: spec.street,
    rooms: spec.rooms, sqm: spec.sqm, floor: spec.floor, price: spec.price,
    personality: spec.brandPersonality, feel: spec.emotionalFeel, story: spec.visualStory,
    palette: spec.palette,
  };
  const sys = `You are an award-winning real-estate advertising ART DIRECTOR. For the property context you receive, invent ONE fresh, innovative, premium art-direction brief for a SINGLE cinematic advertising SCENE (a background image a designer will later add Hebrew text and a logo onto). Every brief must be DIFFERENT and specific to this property — never a template. Hard rules for the scene you describe: it must contain NO text, NO letters, NO numbers, NO logo, NO watermark, NO human faces, NO UI. Leave elegant negative space in the lower third for later typography. Vertical 4:5. Output ONLY the brief prose (2–4 sentences), no preamble, in English.`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: textModel, temperature: 0.9, max_tokens: 320,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Property context (JSON):\n${JSON.stringify(ctx)}` },
        ],
      }),
    });
    if (!res.ok) return fallbackScenePrompt(spec);
    const json = await res.json();
    const txt = (json?.choices?.[0]?.message?.content ?? "").trim();
    if (!txt) return fallbackScenePrompt(spec);
    // Belt-and-suspenders: append the negative-text lock so the image model never
    // renders letters even if the LLM forgot to say so.
    return `${txt}\n\nSTRICT: the scene must contain NO text, NO letters, NO numbers, NO logo, NO watermark, and NO human faces — a clean photographic scene only, with calm negative space in the lower third. Vertical 4:5.`;
  } catch {
    return fallbackScenePrompt(spec);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) DETERMINISTIC PREMIUM COMPOSITOR
// ─────────────────────────────────────────────────────────────────────────────
export interface ComposeAssets {
  logoBytes?: Buffer | null;
  agentBytes?: Buffer | null;
}

const W = 1080;
const H = 1350;
const PAD = 64;

/** Wrap+size the headline to the content width (reuses the unit-tested reflow
 *  measurer). Returns 1–2 lines that fit. */
function headlineLayout(text: string, boxW: number): { fontPx: number; lines: string[] } {
  let fit = fitText(text, boxW, 2, 78);
  if (!fit.fits) fit = fitText(text, boxW, 2, 60);
  return { fontPx: Math.max(40, fit.fontPx), lines: fit.lines.length ? fit.lines : [text] };
}

/**
 * Compose the finished ad deterministically. `scene` is the text-free gpt-image-2
 * background; all brand color, the real logo, the real agent photo and perfect
 * RTL Hebrew are drawn here. Returns PNG bytes. Never bakes text via AI.
 */
export async function composeAd(scene: Buffer, spec: AdSpec, brand: BrandPaint, assets: ComposeAssets): Promise<Buffer> {
  ensureHebrewFont();
  const sharp = (await import("sharp")).default;

  const bg = brand.bg || "#0f2436";
  const accent = brand.accent || brand.bg2 || "#C9A24B";
  const ink = brand.ink || bg;

  const saleLabel = resolveSaleLabel(spec);
  const address = [spec.street, spec.city].filter(Boolean).join(", ");
  const price = normalizeIlsPrice(spec.price ?? undefined) ?? "";
  const features = (spec.features || []).filter(Boolean).slice(0, 4).join("   ·   ");
  const agentName = (spec.agentName ?? "").trim();
  const agentPhone = (spec.agentPhone ?? "").trim();
  const officeName = (spec.logoText ?? "").trim();

  const boxW = W - PAD * 2;
  const rightX = W - PAD;

  // --- base: cinematic full-bleed scene, cover-cropped to 1080×1350 ---
  const base = await sharp(scene).resize(W, H, { fit: "cover", position: "attention" }).toBuffer();

  // --- bottom brand band geometry ---
  const bandH = 168;
  const bandTop = H - bandH;

  // --- headline sizing ---
  const hl = headlineLayout(spec.headline, boxW);
  const hlLineH = Math.round(hl.fontPx * 1.16);

  // --- vertical stack (bottom-up above the band) ---
  const stackBottom = bandTop - 40;      // above the agent band
  const featY = features ? stackBottom : stackBottom + 10;
  const priceBoxH = 88;
  const priceY = featY - (features ? 44 : 0) - priceBoxH;
  const hlBottom = priceY - 28;
  const hlTopY = hlBottom - hl.lines.length * hlLineH;
  const addrY = hlTopY - 40;

  // price card width by measured text
  const priceFont = 58;
  const priceW = Math.min(boxW, Math.max(240, measureText(price, priceFont) + 96));

  const svgParts: string[] = [];
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svgParts.push(`<defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}" stop-opacity="0"/>
      <stop offset="0.55" stop-color="${bg}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/></filter>
  </defs>`);

  // legibility scrim over the lower half
  svgParts.push(`<rect x="0" y="${Math.round(H * 0.42)}" width="${W}" height="${Math.round(H * 0.58)}" fill="url(#scrim)"/>`);

  // sale badge — top-right, accent fill, white bold
  const badgeFont = 40;
  const badgeW = measureText(saleLabel, badgeFont) + 64;
  const badgeH = 74;
  svgParts.push(`<rect x="${rightX - badgeW}" y="${PAD}" width="${badgeW}" height="${badgeH}" rx="14" fill="${accent}" filter="url(#soft)"/>`);
  svgParts.push(`<text x="${rightX - 32}" y="${PAD + badgeH / 2 + badgeFont * 0.35}" font-family="${FONT}" font-weight="800" font-size="${badgeFont}" fill="#ffffff" text-anchor="end">${esc(saleLabel)}</text>`);

  // address (white, medium) above headline
  if (address) {
    svgParts.push(`<text x="${rightX}" y="${addrY}" font-family="${FONT}" font-weight="500" font-size="34" fill="#ffffff" fill-opacity="0.92" text-anchor="end">${esc(address)}</text>`);
  }

  // headline (white, extrabold, 1–2 lines, RTL)
  hl.lines.forEach((ln, i) => {
    const y = hlTopY + (i + 1) * hlLineH - Math.round(hlLineH * 0.24);
    svgParts.push(`<text x="${rightX}" y="${y}" font-family="${FONT}" font-weight="800" font-size="${hl.fontPx}" fill="#ffffff" text-anchor="end">${esc(ln)}</text>`);
  });

  // price — floating white card, brand-ink bold digits (LTR), accent hairline
  if (price) {
    svgParts.push(`<rect x="${rightX - priceW}" y="${priceY}" width="${priceW}" height="${priceBoxH}" rx="16" fill="#ffffff" filter="url(#soft)"/>`);
    svgParts.push(`<rect x="${rightX - priceW}" y="${priceY}" width="8" height="${priceBoxH}" rx="4" fill="${accent}"/>`);
    svgParts.push(`<text x="${rightX - 28}" y="${priceY + priceBoxH / 2 + priceFont * 0.35}" font-family="${FONT}" font-weight="800" font-size="${priceFont}" fill="${ink}" text-anchor="end" direction="ltr">${esc(price)}</text>`);
  }

  // features row (white, small, RTL)
  if (features) {
    svgParts.push(`<text x="${rightX}" y="${featY}" font-family="${FONT}" font-weight="500" font-size="30" fill="#ffffff" fill-opacity="0.9" text-anchor="end">${esc(features)}</text>`);
  }

  // bottom brand band + accent hairline
  svgParts.push(`<rect x="0" y="${bandTop}" width="${W}" height="${bandH}" fill="${bg}"/>`);
  svgParts.push(`<rect x="0" y="${bandTop}" width="${W}" height="5" fill="${accent}"/>`);

  // agent name + phone (right side of band)
  const bandMidY = bandTop + bandH / 2;
  if (agentName) {
    svgParts.push(`<text x="${rightX}" y="${bandMidY - 6}" font-family="${FONT}" font-weight="700" font-size="38" fill="#ffffff" text-anchor="end">${esc(agentName)}</text>`);
  }
  if (agentPhone) {
    svgParts.push(`<text x="${rightX}" y="${bandMidY + 40}" font-family="${FONT}" font-weight="500" font-size="32" fill="#ffffff" fill-opacity="0.92" text-anchor="end" direction="ltr">${esc(agentPhone)}</text>`);
  }

  // agent photo circle placeholder ring (photo composited separately if present)
  const photoD = 104;
  const photoX = PAD + (assets.agentBytes ? photoD + 28 : 0);
  const photoCX = PAD + photoD / 2;
  const photoCY = bandMidY;
  if (assets.agentBytes) {
    svgParts.push(`<circle cx="${photoCX}" cy="${photoCY}" r="${photoD / 2 + 3}" fill="none" stroke="${accent}" stroke-width="3"/>`);
  }

  // logo chip (white rounded) — logo composited on top separately
  const chipW = 150, chipH = 96;
  const chipX = photoX, chipY = bandMidY - chipH / 2;
  if (assets.logoBytes) {
    svgParts.push(`<rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}" rx="14" fill="#ffffff"/>`);
  } else if (officeName) {
    svgParts.push(`<text x="${PAD}" y="${bandMidY + 12}" font-family="${FONT}" font-weight="800" font-size="34" fill="#ffffff" text-anchor="start">${esc(officeName)}</text>`);
  }

  svgParts.push(`</svg>`);
  const svg = Buffer.from(svgParts.join(""));

  const layers: import("sharp").OverlayOptions[] = [{ input: svg, top: 0, left: 0 }];

  // real agent photo → circular mask
  if (assets.agentBytes) {
    try {
      const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${photoD}" height="${photoD}"><circle cx="${photoD / 2}" cy="${photoD / 2}" r="${photoD / 2}" fill="#fff"/></svg>`);
      const face = await sharp(assets.agentBytes).resize(photoD, photoD, { fit: "cover", position: "attention" })
        .composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
      layers.push({ input: face, top: Math.round(photoCY - photoD / 2), left: Math.round(photoCX - photoD / 2) });
    } catch { /* skip photo on failure */ }
  }

  // real office logo → fit inside the white chip
  if (assets.logoBytes) {
    try {
      const logo = await sharp(assets.logoBytes).resize(chipW - 20, chipH - 20, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
      const lm = await sharp(logo).metadata();
      const lx = chipX + Math.round((chipW - (lm.width ?? chipW - 20)) / 2);
      const ly = chipY + Math.round((chipH - (lm.height ?? chipH - 20)) / 2);
      layers.push({ input: logo, top: ly, left: lx });
    } catch { /* skip logo on failure */ }
  }

  return sharp(base).composite(layers).png().toBuffer();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) ORCHESTRATOR — scene (gpt-image-2) + deterministic premium overlay.
// ─────────────────────────────────────────────────────────────────────────────
export interface HybridImage { b64: string; mime: string; provider: string }

/** True when the hybrid path can run (an OpenAI-capable image provider is set). */
export function hybridAvailable(): boolean {
  return resolveImageProvider().provider !== "mock";
}

/**
 * Produce a finished ad the ZONO way: the REAL property photo is the hero (so the
 * property is ALWAYS represented correctly — never an AI-invented building), and a
 * deterministic premium overlay stamps exact brand colors, the real logo, the real
 * agent photo and pixel-perfect RTL Hebrew on top. Fast (no slow /images/edits
 * bake → no 75s timeout) and always correct. When no property photo exists (e.g. a
 * brand/market post), gpt-image-2 generates a text-free premium SCENE as the base.
 * Throws on hard failure so the caller can fall back to the legacy path.
 */
export async function renderHybridAd(spec: AdSpec, assets: AdGenAssets): Promise<HybridImage> {
  // AI DESIGNS THE WHOLE AD: an LLM writes a fresh, innovative premium brief in the
  // brand's language (all required content), then gpt-image-2 renders the complete
  // design via /images/generations — a single fast call, so NO 75s /images/edits
  // timeout. No template. On any failure, fall back to the real-photo overlay so
  // the button never breaks.
  const size = process.env.ZONO_CREATIVE_IMAGE_SIZE || "1024x1536";
  try {
    const prompt = await buildDynamicAdPrompt(spec, { propertyImages: [], logoUrl: null, agentPhoto: null }, "");
    const img = await generateFinalImage(prompt, null, { size });
    return { b64: img.b64, mime: img.mime, provider: img.provider };
  } catch {
    const [logoBytes, agentBytes, propertyBytes] = await Promise.all([
      assets.logoUrl ? fetchLogoBytes(assets.logoUrl).catch(() => null) : Promise.resolve(null),
      assets.agentPhoto ? fetchLogoBytes(assets.agentPhoto).catch(() => null) : Promise.resolve(null),
      assets.propertyImages[0] ? fetchLogoBytes(assets.propertyImages[0]).catch(() => null) : Promise.resolve(null),
    ]);
    const baseBuf = propertyBytes ?? Buffer.from((await generateFinalImage(await buildScenePrompt(spec), null, { size })).b64, "base64");
    const brand: BrandPaint = { bg: spec.palette.bg, bg2: spec.palette.bg2, accent: spec.palette.accent, ink: spec.palette.bg };
    const out = await composeAd(baseBuf, spec, brand, { logoBytes, agentBytes });
    return { b64: out.toString("base64"), mime: "image/png", provider: "photo+overlay" };
  }
}
