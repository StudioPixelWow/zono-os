// ============================================================================
// ZONO Office/Agent Website — LOGO → BRAND COLOR derivation (server-only).
// ----------------------------------------------------------------------------
// When an office/agent has uploaded a logo but never configured a brand color,
// the public site would fall back to a generic neutral. This derives a usable
// brand primary from the logo's own dominant *saturated* hue — so a gold logo
// yields a gold site, a green logo a green site, etc. NOTHING is hardcoded per
// tenant; the color comes entirely from the tenant's own asset.
//
// Safety contract (never regress the page):
//   · hard network timeout (logo fetch is best-effort)
//   · saturation/coverage gate — a muddy photo or greyscale mark returns null
//     (caller keeps the neutral default) so we never force an ugly hue
//   · every failure path returns null and is swallowed by the caller
//   · results cached per-URL for the process lifetime (metadata + page = 1 fetch)
// ============================================================================
import "server-only";
import sharp from "sharp";

const cache = new Map<string, string | null>();
const FETCH_TIMEOUT_MS = 2500;
const SAMPLE = 48; // downscale target — enough signal, negligible cost

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  if (d !== 0) {
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

/**
 * Derive a brand primary hex from a logo URL, or null when the logo can't be
 * read or has no confident brand hue. Result is cached per URL.
 */
export async function deriveBrandColorFromLogo(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url) ?? null;
  const result = await compute(url).catch(() => null);
  cache.set(url, result);
  return result;
}

async function compute(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let buf: Buffer;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }

  const { data } = await sharp(buf)
    .resize(SAMPLE, SAMPLE, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Bucket saturated, mid-light pixels by hue; the dominant bucket is the mark.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let sampled = 0;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    sampled++;
    if (s < 0.28 || l < 0.22 || l > 0.86) continue; // skip greys / near-black / near-white
    const key = Math.round(h / 20) * 20; // 18 hue buckets
    const e = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    e.count++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  if (sampled === 0) return null;

  let best: { count: number; r: number; g: number; b: number } | null = null;
  let saturatedTotal = 0;
  for (const e of buckets.values()) {
    saturatedTotal += e.count;
    if (!best || e.count > best.count) best = e;
  }
  if (!best) return null;

  // Coverage gate: a confident brand mark occupies a real share of the logo.
  if (saturatedTotal / sampled < 0.06) return null;

  const [ar, ag, ab] = [best.r / best.count, best.g / best.count, best.b / best.count];
  const [h, s, l] = rgbToHsl(ar, ag, ab);
  if (s < 0.3) return null; // final saturation gate — never emit a muddy hue

  // Normalize into a usable primary band: keep the hue, ensure it's rich enough
  // for a CTA/accent and not so pale/dark it reads wrong on white.
  const nl = Math.max(0.34, Math.min(0.6, l));
  const ns = Math.max(0.45, Math.min(0.85, s));
  return toHex(...hslToRgb(h, ns, nl));
}
