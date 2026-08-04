// ============================================================================
// ZONO creative-studio — deterministic logo compositing (server-only).
//
// The office logo is NEVER drawn by the image model (it can distort it). The
// exact logo asset is composited programmatically onto the finished creative:
//   • aspect ratio preserved, max width/height respected
//   • placement follows the layout execution plan's safe zones (not a fixed
//     center-bottom) — it avoids the property/face/price/CTA regions
//   • the light/dark logo variant is chosen by background contrast
// Pure placement/contrast math lives in ./visual-gen-math (unit-tested).
// ============================================================================
import "server-only";
import {
  computeLogoPlacement, safeLogoPlacement, chooseLogoVariant,
} from "./visual-gen-math";
import type { LogoCompositeOptions, LogoPlacement, SafeZone } from "./visual-gen-math";

export { computeLogoPlacement, safeLogoPlacement, chooseLogoVariant };
export type { LogoCompositeOptions, LogoPlacement, SafeZone };

export interface LogoVariants {
  transparent?: string | null;
  light?: string | null;
  dark?: string | null;
  primary?: string | null;
}

/** Choose the best logo URL for a background: contrast-correct variant, transparent preferred. */
export function selectLogoUrl(v: LogoVariants, backgroundHex: string | null): string | null {
  const want = backgroundHex ? chooseLogoVariant(backgroundHex) : "dark";
  const byContrast = want === "light" ? v.light : v.dark;
  return v.transparent ?? byContrast ?? v.primary ?? v.dark ?? v.light ?? null;
}

/** Fetch a logo URL into a Buffer (null on failure — compositing is best-effort). */
export async function fetchLogoBytes(logoUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Composite the logo bytes onto the base image using `sharp`, placing it clear
 * of the given safe zones. Returns new PNG bytes; on any failure returns the
 * base unchanged so compositing never blocks delivery.
 */
export async function compositeLogo(
  baseBytes: Buffer, logoBytes: Buffer, opts: LogoCompositeOptions & { safeZones?: SafeZone[] } = {},
): Promise<Buffer> {
  try {
    const sharpMod = (await import("sharp")).default;
    const meta = await sharpMod(baseBytes).metadata();
    const imgW = meta.width ?? 1080;
    const imgH = meta.height ?? 1350;
    let targetLogoW = Math.max(1, Math.round(imgW * (opts.widthPct ?? 0.35)));
    if (opts.maxWidthPx) targetLogoW = Math.min(targetLogoW, opts.maxWidthPx);
    const resizedLogo = await sharpMod(logoBytes).resize(targetLogoW, null, { fit: "inside" }).png().toBuffer();
    const logoMeta = await sharpMod(resizedLogo).metadata();
    const logoH = logoMeta.height ?? Math.round(targetLogoW * 0.3);
    const zones = opts.safeZones ?? [];
    const place: LogoPlacement = zones.length
      ? safeLogoPlacement(imgW, imgH, targetLogoW, logoH, zones, opts).placement
      : computeLogoPlacement(imgW, imgH, targetLogoW, logoH, opts);
    return await sharpMod(baseBytes)
      .composite([{ input: resizedLogo, left: place.left, top: place.top }])
      .png()
      .toBuffer();
  } catch {
    return baseBytes;
  }
}

/** Convenience: pick the contrast-correct logo variant + composite (passthrough if unavailable). */
export async function compositeBrandLogo(
  baseBytes: Buffer, variants: LogoVariants, backgroundHex: string | null,
  opts: LogoCompositeOptions & { safeZones?: SafeZone[] } = {},
): Promise<Buffer> {
  const url = selectLogoUrl(variants, backgroundHex);
  if (!url) return baseBytes;
  const logo = await fetchLogoBytes(url);
  if (!logo) return baseBytes;
  return compositeLogo(baseBytes, logo, opts);
}
