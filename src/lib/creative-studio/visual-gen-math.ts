// ============================================================================
// ZONO creative-studio — pure visual-generation math (no server-only, no deps).
// Placement, contrast, safe-zone and size logic shared by the server-only
// compositing modules and by the unit tests. Keep this file free of I/O and
// native imports.
// ============================================================================

export interface LogoCompositeOptions {
  /** Logo width as a fraction of the base image width. Default 0.35. */
  widthPct?: number;
  /** Bottom margin as a fraction of the base image height. Default 0.03. */
  bottomMarginPct?: number;
  /** Hard cap on logo width in px. */
  maxWidthPx?: number;
  /** Hard cap on logo height in px. */
  maxHeightPx?: number;
}

export interface LogoPlacement {
  targetLogoW: number;
  targetLogoH: number;
  left: number;
  top: number;
}

/** A protected rectangle the logo must not overlap (fractions of W/H, 0..1). */
export interface SafeZone {
  name: string;
  x: number; y: number; w: number; h: number;
}

/**
 * Compute resized-logo dimensions + top/left offset for a center-bottom
 * placement (aspect ratio preserved, respecting max width/height). Pure.
 */
export function computeLogoPlacement(
  imgW: number, imgH: number, logoW: number, logoH: number, opts: LogoCompositeOptions = {},
): LogoPlacement {
  const widthPct = opts.widthPct ?? 0.35;
  const bottomMarginPct = opts.bottomMarginPct ?? 0.03;
  let targetLogoW = Math.max(1, Math.round(imgW * widthPct));
  if (opts.maxWidthPx) targetLogoW = Math.min(targetLogoW, opts.maxWidthPx);
  const ratio = logoW > 0 ? logoH / logoW : 0.3;
  let targetLogoH = Math.max(1, Math.round(targetLogoW * ratio));
  if (opts.maxHeightPx && targetLogoH > opts.maxHeightPx) {
    targetLogoH = opts.maxHeightPx;
    targetLogoW = Math.max(1, Math.round(targetLogoH / (ratio || 0.3)));
  }
  const left = Math.round((imgW - targetLogoW) / 2);
  const top = Math.round(imgH - targetLogoH - imgH * bottomMarginPct);
  return { targetLogoW, targetLogoH, left, top: Math.max(0, top) };
}

/** Does a placement rectangle overlap any safe zone? Pure. */
export function placementCollides(
  imgW: number, imgH: number, p: LogoPlacement, zones: SafeZone[],
): SafeZone | null {
  const pl = p.left, pt = p.top, pr = p.left + p.targetLogoW, pb = p.top + p.targetLogoH;
  for (const z of zones) {
    const zl = z.x * imgW, zt = z.y * imgH, zr = (z.x + z.w) * imgW, zb = (z.y + z.h) * imgH;
    const overlap = pl < zr && pr > zl && pt < zb && pb > zt;
    if (overlap) return z;
  }
  return null;
}

/**
 * Place the logo center-bottom, but if it collides with a safe zone, nudge it
 * upward until clear (bounded). Returns the best non-colliding placement, or the
 * top-most attempt if none is fully clear. Pure — the layout execution plan
 * supplies the safe zones (property/face/price/CTA).
 */
export function safeLogoPlacement(
  imgW: number, imgH: number, logoW: number, logoH: number, zones: SafeZone[], opts: LogoCompositeOptions = {},
): { placement: LogoPlacement; collidedWith: string | null } {
  const base = computeLogoPlacement(imgW, imgH, logoW, logoH, opts);
  if (placementCollides(imgW, imgH, base, zones) == null) return { placement: base, collidedWith: null };
  const step = Math.max(1, Math.round(imgH * 0.02));
  let cur = { ...base };
  for (let i = 0; i < 40 && cur.top - step >= 0; i++) {
    cur = { ...cur, top: cur.top - step };
    if (placementCollides(imgW, imgH, cur, zones) == null) return { placement: cur, collidedWith: null };
  }
  const hit = placementCollides(imgW, imgH, base, zones);
  return { placement: cur, collidedWith: hit ? hit.name : null };
}

// ── Contrast → light/dark logo choice ────────────────────────────────────────

/** Relative luminance of an #RRGGBB (or #RGB) color, 0..1 (WCAG). Pure. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return 0.5;
  const toLin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const r = toLin(parseInt(full.slice(0, 2), 16));
  const g = toLin(parseInt(full.slice(2, 4), 16));
  const b = toLin(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Choose the logo variant that contrasts with the background. Pure. */
export function chooseLogoVariant(backgroundHex: string): "light" | "dark" {
  // Dark background → light logo; light background → dark logo.
  return relativeLuminance(backgroundHex) < 0.5 ? "light" : "dark";
}

// ── Platform sizes ────────────────────────────────────────────────────────────

export interface PlatformSize {
  key: string;
  label: string;
  platform: string;
  width: number;
  height: number;
  aspect: string;
}

function aspectOf(w: number, h: number): string {
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const d = g(w, h);
  return `${w / d}:${h / d}`;
}

function size(key: string, label: string, platform: string, width: number, height: number): PlatformSize {
  return { key, label, platform, width, height, aspect: aspectOf(width, height) };
}

/** Canonical platform export sizes (fit:cover / deterministic reflow crops). */
export const PLATFORM_SIZES: PlatformSize[] = [
  size("instagram_square", "Instagram Square", "instagram", 1080, 1080),
  size("instagram_portrait", "Instagram Portrait", "instagram", 1080, 1350),
  size("story", "Story / Reel", "story", 1080, 1920),
  size("facebook", "Facebook Landscape", "facebook", 1200, 630),
  size("whatsapp", "WhatsApp Share", "whatsapp", 1080, 1080),
];

export function platformSize(key: string): PlatformSize | undefined {
  return PLATFORM_SIZES.find((s) => s.key === key);
}
