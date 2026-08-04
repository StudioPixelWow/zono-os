// ============================================================================
// ZONO creative-studio — platform size variants (server-only).
//
// From one approved creative, produce correctly-sized platform crops with
// fit:cover (NEVER contain — no black letterbox bars). The pure size table
// lives in ./visual-gen-math; the sharp resize is a thin wrapper here.
// ============================================================================
import "server-only";
import { PLATFORM_SIZES, platformSize } from "./visual-gen-math";
import type { PlatformSize } from "./visual-gen-math";

export { PLATFORM_SIZES, platformSize };
export type { PlatformSize };

export interface RenderedVariant {
  key: string;
  platform: string;
  width: number;
  height: number;
  bytes: Buffer;
}

/**
 * Resize a base image into the requested platform sizes using fit:cover +
 * center position (no distortion, no letterboxing). Returns PNG bytes per size.
 * Defaults to all three canonical sizes.
 */
export async function renderSizeVariants(
  baseBytes: Buffer, sizes: PlatformSize[] = PLATFORM_SIZES,
): Promise<RenderedVariant[]> {
  const sharpMod = (await import("sharp")).default;
  const out: RenderedVariant[] = [];
  for (const s of sizes) {
    const bytes = await sharpMod(baseBytes)
      .resize(s.width, s.height, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    out.push({ key: s.key, platform: s.platform, width: s.width, height: s.height, bytes });
  }
  return out;
}
