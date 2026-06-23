// ============================================================================
// ZONO — Creative Production Engine (CPE)  ·  server-only
// ----------------------------------------------------------------------------
// Turns an approved concept + art direction into a PRODUCTION-GRADE advertising
// SCENE via an AI image model, then the Composite Layer (renderer) overlays the
// LOCKED real assets + deterministic Hebrew on top.
//
//   AI owns the scene (drama/atmosphere)  +  locked photo/logo/agent/Hebrew (truth)
//   = real advertisement (not a card).
//
// Hard rules: the AI scene NEVER contains text, logo, faces or an invented
// apartment (enforced by the negative prompt + asset gate). Hebrew + exact assets
// are always the deterministic overlay. No key / failure → deterministic renderer.
// ============================================================================
import "server-only";
import { generateFinalImage, resolveImageProvider, type ImageProviderInfo } from "./visual-providers";
import type { FinalAdData } from "./final-creative-engine";

export type SceneMode = "ai_hero_integrated" | "ai_scene_overlay" | "none";
export type SceneStatus = "ai_hero" | "ai_scene" | "no_provider" | "failed";

export interface AdSceneResult {
  status: SceneStatus; mode: SceneMode; provider: string;
  b64?: string; mime?: string; prompt: string; error?: string;
}

const NEG = "ABSOLUTELY NO text of any language (no Hebrew, no English, no numbers, no captions, no watermark), NO logo or brand mark, NO people or faces, NO invented apartment/interior, NO UI, NO app, NO card, NO icons, NO emojis";

/** Build the production-grade ADVERTISING scene prompt for one concept. This is
 *  advertising language — drama, composition, emotion, perceived value — NOT UI. */
export function buildAdScenePrompt(ad: FinalAdData, heroIntegrated: boolean): string {
  const adr = ad.artDirection;
  const env = adr?.aiEnvironment;
  const pal = ad.palette;
  const story = adr?.visualStory ?? "premium real-estate advertising";
  const feel = adr?.emotionalFeel ?? "premium and confident";
  const lighting = env?.lighting ?? "cinematic lighting";
  const bg = env?.backgroundTreatment ?? "rich premium gradient with depth";
  const texture = env?.textures ?? "refined premium textures";
  const framing = env?.framing ?? "balanced premium framing";
  const fx = env?.premiumEffects ?? "soft glow, subtle depth";
  const palette = [pal.bg, pal.bg2, pal.accent].filter(Boolean).join(", ");

  const heroLine = heroIntegrated
    ? "Use the SUPPLIED property photo as the HERO of the scene — keep the building/apartment REAL and unaltered (only relight, color-grade, and extend the surrounding environment cinematically around it). Do NOT redesign the property, do NOT add rooms or features."
    : "Create a premium abstract advertising ENVIRONMENT only (no property depicted) — the real property photo is composited on top afterwards.";

  return [
    `Premium real-estate ADVERTISING scene, 1:1 square, magazine-grade campaign quality — ${ad.triggerLabel} concept.`,
    `Visual story: ${story}. Emotional tone: ${feel}.`,
    heroLine,
    `Lighting: ${lighting}. Background: ${bg}. Texture: ${texture}. Composition/framing: ${framing}, strong depth layers, cinematic perceived value.`,
    `Premium effects: ${fx}. Brand color mood: ${palette}.`,
    "Leave clean NEGATIVE SPACE in the lower third and one corner for headline, price, logo and agent to be overlaid later by the app.",
    `Output: a high-end advertising visual — ${NEG}.`,
  ].join("\n");
}

/** Read-only env status for the UI banner ("AI provider not configured"). */
export function aiProviderStatus(): ImageProviderInfo {
  return resolveImageProvider();
}

/** Produce the AI advertising scene for one concept. Never throws — returns a
 *  status the caller stamps so the UI explains AI vs fallback. */
export async function produceAdScene(ad: FinalAdData): Promise<AdSceneResult> {
  const info = resolveImageProvider();
  if (info.provider === "mock") {
    return { status: "no_provider", mode: "none", provider: "mock", prompt: "", error: info.reason };
  }
  // Gemini can keep the supplied photo (hero-integrated). OpenAI path is scene-only
  // (our image call sends no reference) → composite the real photo on top.
  const heroIntegrated = info.provider === "gemini" && Boolean(ad.propertyImage);
  const prompt = buildAdScenePrompt(ad, heroIntegrated);
  try {
    // The ad canvas is 1:1 — request a square scene (OpenAI honours size; Gemini
    // ignores it and uses the prompt's "1:1 square" instruction).
    const img = await generateFinalImage(prompt, heroIntegrated ? ad.propertyImage : null, { size: "1024x1024" });
    return {
      status: heroIntegrated ? "ai_hero" : "ai_scene",
      mode: heroIntegrated ? "ai_hero_integrated" : "ai_scene_overlay",
      provider: img.provider, b64: img.b64, mime: img.mime, prompt,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", mode: "none", provider: info.provider, prompt, error: msg.slice(0, 500) };
  }
}
