// ============================================================================
// ZONO creative-studio — deterministic per-aspect overlay reflow (pure).
//
// Only the photographic layer uses cover crop. Every overlay (headline, price,
// facts, CTA, phone, logo, footer, market source/period, agent/office name) is
// laid out INDEPENDENTLY for each format using a format-specific plan + safe
// zones, RTL text measurement, line wrapping, and bounded font sizing. QA
// rejects overlap, clipping, sub-minimum fonts, and focal/safe-zone violations.
// No native deps here → unit-tested deterministically; the sharp renderer
// (reflow-render.ts) consumes this plan.
// ============================================================================

export type ReflowFormat = "ig_square" | "ig_portrait" | "story" | "fb_landscape" | "whatsapp" | "master";

export interface FormatDim { key: ReflowFormat; width: number; height: number }
export const REFLOW_FORMATS: FormatDim[] = [
  { key: "ig_square", width: 1080, height: 1080 },
  { key: "ig_portrait", width: 1080, height: 1350 },
  { key: "story", width: 1080, height: 1920 },
  { key: "fb_landscape", width: 1200, height: 630 },
  { key: "whatsapp", width: 1080, height: 1080 },
  { key: "master", width: 1080, height: 1350 },
];

export interface Rect { x: number; y: number; w: number; h: number }
export interface SafeZones {
  storyTopUi?: Rect;      // Story platform UI exclusion (top)
  storyBottomUi?: Rect;   // Story platform UI exclusion (bottom)
  focal?: Rect;           // face / property focal — overlays must avoid
}

export interface OverlayContent {
  headline: string;
  secondary?: string | null;
  price?: string | null;
  facts?: string[];
  cta: string;
  phone?: string | null;
  identity?: string | null;     // agent or office name
  footer?: string | null;
  marketSource?: string | null; // market-stat source · period
  hasLogo: boolean;
  backgroundHex: string;
}

export interface PlacedElement { name: string; rect: Rect; fontPx: number; lines: string[]; align: "start" | "end" | "center" }
export interface ReflowPlan { format: ReflowFormat; width: number; height: number; safe: SafeZones; elements: PlacedElement[] }
export interface ReflowQA { ok: boolean; violations: string[] }

export const MIN_FONT_PX = 22;

/** Approximate RTL text width. Hebrew glyphs ~0.58×font; ASCII ~0.52×font. Pure. */
export function measureText(text: string, fontPx: number): number {
  let units = 0;
  for (const ch of text) units += /[֐-׿]/.test(ch) ? 0.58 : ch === " " ? 0.30 : 0.52;
  return Math.ceil(units * fontPx);
}

/** Greedy word-wrap to a max width; returns lines (never splits a word). Pure. */
export function wrapText(text: string, maxWidthPx: number, fontPx: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    const candidate = cur ? cur + " " + w : w;
    if (measureText(candidate, fontPx) <= maxWidthPx || !cur) cur = candidate;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Fit text to a box: shrink font (down to MIN_FONT_PX) until it fits maxLines. Pure. */
export function fitText(text: string, boxW: number, maxLines: number, startFont: number): { fontPx: number; lines: string[]; fits: boolean } {
  for (let f = startFont; f >= MIN_FONT_PX; f -= 2) {
    const lines = wrapText(text, boxW, f);
    if (lines.length <= maxLines) return { fontPx: f, lines, fits: true };
  }
  const lines = wrapText(text, boxW, MIN_FONT_PX).slice(0, maxLines);
  return { fontPx: MIN_FONT_PX, lines, fits: false };
}

const LINE_H = 1.2;
function lineHeight(fontPx: number): number { return Math.round(fontPx * LINE_H); }
function blockHeight(lines: number, fontPx: number): number { return lines * lineHeight(fontPx); }

/** Per-format band fraction — how much of the height the text/logo band occupies. */
function bandFractionFor(key: ReflowFormat): number {
  switch (key) {
    case "fb_landscape": return 0.60;
    case "story": return 0.44;
    case "ig_square":
    case "whatsapp": return 0.52;
    case "ig_portrait":
    case "master":
    default: return 0.50;
  }
}

interface Geometry {
  pad: number; boxW: number; bandTop: number; bandBottom: number;
  logoW: number; logoH: number; textBottom: number; hasStory: boolean;
  safe: SafeZones;
}

/**
 * Deterministic geometry: the focal photo area sits on top, the text/logo band
 * on the bottom. The focal safe-zone ends ABOVE the band (so overlays never
 * collide with it) and the logo is reserved at the band bottom. Story formats
 * additionally exclude the platform top/bottom UI strips.
 */
function computeGeometry(dim: FormatDim, hasLogo: boolean): Geometry {
  const pad = Math.round(dim.width * 0.05);
  const boxW = dim.width - pad * 2;
  const hasStory = dim.key === "story";
  const bandFrac = bandFractionFor(dim.key);

  let bandTop: number, bandBottom: number;
  let storyTopUi: Rect | undefined, storyBottomUi: Rect | undefined;
  if (hasStory) {
    storyTopUi = { x: 0, y: 0, w: dim.width, h: Math.round(dim.height * 0.12) };
    storyBottomUi = { x: 0, y: Math.round(dim.height * 0.88), w: dim.width, h: Math.round(dim.height * 0.12) };
    bandBottom = storyBottomUi.y - pad;
    bandTop = storyBottomUi.y - Math.round(dim.height * bandFrac);
  } else {
    bandBottom = dim.height - pad;
    bandTop = dim.height - Math.round(dim.height * bandFrac);
  }

  const logoW = hasLogo ? Math.round(dim.width * (dim.key === "fb_landscape" ? 0.22 : 0.3)) : 0;
  const logoH = hasLogo ? Math.round(logoW * 0.34) : 0;
  const textBottom = hasLogo ? (bandBottom - logoH - Math.round(pad * 0.5)) : bandBottom;

  const focalTop = Math.round(dim.height * (hasStory ? 0.14 : 0.06));
  const focal: Rect = { x: Math.round(dim.width * 0.1), y: focalTop, w: Math.round(dim.width * 0.8), h: (bandTop - pad) - focalTop };
  const safe: SafeZones = { focal, storyTopUi, storyBottomUi };

  return { pad, boxW, bandTop, bandBottom, logoW, logoH, textBottom, hasStory, safe };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Build the deterministic overlay layout for one format. The photographic focal
 * area is on top; every overlay is recomposed INDEPENDENTLY in the bottom band.
 * Required elements (headline, CTA, and footer when present) are guaranteed a
 * slot; optional elements (secondary, price, facts, market source, identity)
 * are added top-down only while they fit — never overlapping, clipping, or
 * colliding with the focal area or the reserved logo. RTL → right-aligned.
 */
export function buildReflowPlan(format: ReflowFormat, content: OverlayContent): ReflowPlan {
  const dim = REFLOW_FORMATS.find((x) => x.key === format)!;
  const g = computeGeometry(dim, content.hasLogo);
  const { pad, boxW, bandTop, bandBottom, textBottom, safe } = g;
  const gap = Math.round(pad * 0.35);

  const elements: PlacedElement[] = [];
  const push = (name: string, y: number, fit: { fontPx: number; lines: string[] }, align: "start" | "end" | "center" = "end") => {
    elements.push({ name, rect: { x: pad, y, w: boxW, h: blockHeight(fit.lines.length, fit.fontPx) }, fontPx: fit.fontPx, lines: fit.lines, align });
  };

  // --- reserve required bottom elements (footer, then CTA) ---
  const ctaFont = 34;
  const ctaText = content.cta + (content.phone ? `   ${content.phone}` : "");
  const ctaFit = fitText(ctaText, boxW, 1, ctaFont);
  const ctaH = blockHeight(ctaFit.lines.length, ctaFit.fontPx);
  const footerFit = content.footer ? fitText(content.footer, boxW, 1, 22) : null;
  const footerH = footerFit ? blockHeight(footerFit.lines.length, footerFit.fontPx) : 0;
  const reserveBottom = ctaH + gap + (footerFit ? footerH + gap : 0);

  // --- headline (required), capped so it never intrudes on the reserved zone ---
  const headlineStart = format === "fb_landscape" ? 48 : format === "story" ? 76 : 60;
  const headlineMaxH = Math.max(lineHeight(MIN_FONT_PX), (textBottom - bandTop) - reserveBottom - gap);
  let headlineFit = fitText(content.headline, boxW, 2, headlineStart);
  if (blockHeight(headlineFit.lines.length, headlineFit.fontPx) > headlineMaxH) {
    headlineFit = fitText(content.headline, boxW, 1, headlineStart);
  }
  let y = bandTop;
  push("headline", y, headlineFit);
  y += blockHeight(headlineFit.lines.length, headlineFit.fontPx) + gap;

  // --- optional elements, top-down, only while they fit above the reserved zone ---
  const optionalBudgetBottom = textBottom - reserveBottom;
  const tryOptional = (name: string, text: string | null | undefined, maxLines: number, startFont: number) => {
    if (!text) return;
    const fit = fitText(text, boxW, maxLines, startFont);
    const h = blockHeight(fit.lines.length, fit.fontPx);
    if (y + h <= optionalBudgetBottom) { push(name, y, fit); y += h + gap; }
  };
  tryOptional("secondary", content.secondary, 1, 40);
  tryOptional("price", content.price, 1, 52);
  tryOptional("facts", content.facts && content.facts.length ? content.facts.join("  ·  ") : null, 1, 34);
  tryOptional("market_source", content.marketSource, 1, 26);
  tryOptional("identity", content.identity, 1, 34);

  // --- anchor required bottom elements (footer at very bottom, CTA above it) ---
  let anchor = textBottom;
  if (footerFit) { anchor -= footerH; push("footer", anchor, footerFit); anchor -= gap; }
  push("cta", anchor - ctaH, ctaFit);

  // --- logo: reserved rect at the band bottom, never overlapping text ---
  if (content.hasLogo) {
    elements.push({ name: "logo", rect: { x: pad, y: bandBottom - g.logoH, w: g.logoW, h: g.logoH }, fontPx: 0, lines: [], align: "start" });
  }
  return { format, width: dim.width, height: dim.height, safe, elements };
}

/** Deterministic QA: no overlap, nothing clipped past the band, fonts ≥ min, focal/safe respected. */
export function reflowQA(plan: ReflowPlan): ReflowQA {
  const v: string[] = [];
  const els = plan.elements;
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e.name !== "logo" && e.fontPx < MIN_FONT_PX) v.push(`${e.name}: font ${e.fontPx} below min`);
    if (e.rect.y + e.rect.h > plan.height) v.push(`${e.name}: clipped past canvas`);
    if (e.rect.x < 0 || e.rect.x + e.rect.w > plan.width) v.push(`${e.name}: horizontal overflow`);
    if (plan.safe.storyBottomUi && overlaps(e.rect, plan.safe.storyBottomUi)) v.push(`${e.name}: enters Story bottom UI`);
    if (plan.safe.storyTopUi && overlaps(e.rect, plan.safe.storyTopUi)) v.push(`${e.name}: enters Story top UI`);
    if (plan.safe.focal && overlaps(e.rect, plan.safe.focal)) v.push(`${e.name}: overlaps focal area`);
    for (let j = i + 1; j < els.length; j++) if (overlaps(e.rect, els[j].rect)) v.push(`${e.name} overlaps ${els[j].name}`);
  }
  return { ok: v.length === 0, violations: v };
}
