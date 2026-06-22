// ============================================================================
// ZONO — Brand Color Intelligence (client-side, deterministic — NO LLM)
// ----------------------------------------------------------------------------
// Extracts dominant brand colors from a logo image using canvas pixel
// quantization (coarse RGB buckets), filtered for near-white/near-black/low-
// alpha noise. Returns primary/secondary/accent + palette + a confidence score
// derived from how dominant the top bucket is. Runs in the browser only.
// ============================================================================

export interface ExtractedColors { primary: string; secondary: string; accent: string; palette: string[]; confidence: number }

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
function luminance(r: number, g: number, b: number) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function saturation(r: number, g: number, b: number) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }

/** Extract brand colors from an already-loaded HTMLImageElement. */
export function extractColorsFromImage(img: HTMLImageElement): ExtractedColors {
  const W = 96, H = 96;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { primary: "", secondary: "", accent: "", palette: [], confidence: 0 };
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const buckets = new Map<string, { r: number; g: number; b: number; n: number; sat: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue; // transparent
    const lum = luminance(r, g, b);
    if (lum > 244 || lum < 12) continue; // near-white / near-black noise
    total++;
    // coarse 24-step buckets
    const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, sat: 0 };
    cur.r += r; cur.g += g; cur.b += b; cur.n++; cur.sat += saturation(r, g, b);
    buckets.set(key, cur);
  }
  if (total === 0) return { primary: "", secondary: "", accent: "", palette: [], confidence: 0 };

  const ranked = Array.from(buckets.values())
    .map((b) => ({ hex: toHex(Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)), n: b.n, sat: b.sat / b.n }))
    .sort((a, b) => b.n - a.n);

  const palette = ranked.slice(0, 6).map((x) => x.hex);
  const primary = ranked[0]?.hex ?? "";
  // secondary: next distinct; accent: most saturated among top buckets
  const secondary = ranked.find((x) => x.hex !== primary)?.hex ?? primary;
  const accent = [...ranked].sort((a, b) => b.sat - a.sat)[0]?.hex ?? primary;

  const topShare = (ranked[0]?.n ?? 0) / total;
  const distinct = new Set(palette).size;
  const confidence = Math.max(0, Math.min(100, Math.round(topShare * 60 + Math.min(40, distinct * 8))));

  return { primary, secondary, accent, palette, confidence };
}

/** Load a File and extract colors. */
export function extractColorsFromFile(file: File): Promise<ExtractedColors> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { try { resolve(extractColorsFromImage(img)); } finally { URL.revokeObjectURL(url); } };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("טעינת התמונה נכשלה")); };
    img.src = url;
  });
}
