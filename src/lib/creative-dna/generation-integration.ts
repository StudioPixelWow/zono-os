// ============================================================================
// ZONO — Creative DNA → generation integration (server-only).
// Resolves the selected Creative DNA (a DB profile OR a code preset), turns it
// into the reusable Style-DNA prompt block, appends it to the ad prompt, and
// logs which DNA was applied (creative_generation_references) for learning.
// The DNA steers ART DIRECTION ONLY — never the property data, agent, price,
// address, logo or photo (enforced inside buildStyleDnaPromptBlock).
// ============================================================================
import "server-only";
import { creativeDnaRepository } from "./repository";
import { buildStyleDnaPromptBlock, getPreset, presetToDnaLike } from "./prompts";
import type { CreativeDnaLike, CreativeDnaProfileRow, ReferenceStrength } from "./types";

function profileToDnaLike(p: CreativeDnaProfileRow): CreativeDnaLike {
  return {
    id: p.id, presetKey: null, name: p.name, styleType: p.style_type, status: p.status,
    stylePrompt: p.style_prompt, negativePrompt: p.negative_prompt, colorPalette: p.color_palette ?? [],
    layoutRules: p.layout_rules ?? {}, typographyRules: p.typography_rules ?? {}, hierarchyRules: p.hierarchy_rules ?? {},
    iconRules: p.icon_rules ?? {}, agentPositioningRules: p.agent_positioning_rules ?? {},
    logoRules: p.logo_rules ?? {}, imageUsageRules: p.image_usage_rules ?? {},
  };
}

export interface ResolvedDna { dna: CreativeDnaLike; source: "profile" | "preset" | "default" }

/**
 * Resolve which Creative DNA to apply, in priority:
 *   explicit profileId → explicit presetKey → org default profile → preset default.
 */
export async function resolveCreativeDna(opts: { profileId?: string | null; presetKey?: string | null }): Promise<ResolvedDna | null> {
  if (opts.profileId) {
    const p = await creativeDnaRepository.getProfile(opts.profileId);
    if (p && p.status === "ready" && p.style_prompt) return { dna: profileToDnaLike(p), source: "profile" };
  }
  if (opts.presetKey) {
    const preset = getPreset(opts.presetKey);
    if (preset) return { dna: presetToDnaLike(preset), source: "preset" };
  }
  // org default profile (only if analyzed/ready)
  const profiles = await creativeDnaRepository.listProfiles();
  const def = profiles.find((p) => p.is_default && p.status === "ready" && p.style_prompt);
  if (def) return { dna: profileToDnaLike(def), source: "profile" };
  return null; // caller decides whether to fall back to a default preset
}

export interface ApplyDnaResult { prompt: string; applied: boolean; dnaName: string | null; source: string | null }

/**
 * Append the resolved Style-DNA block to an ad prompt and (when possible) log
 * the application. Returns the (possibly unchanged) prompt + what was applied.
 */
export async function applyCreativeDNAToGenerationPrompt(
  basePrompt: string,
  opts: { profileId?: string | null; presetKey?: string | null; strength?: ReferenceStrength; propertyId?: string | null; generationId?: string | null; log?: boolean },
): Promise<ApplyDnaResult> {
  const resolved = await resolveCreativeDna({ profileId: opts.profileId, presetKey: opts.presetKey });
  if (!resolved) return { prompt: basePrompt, applied: false, dnaName: null, source: null };

  const strength: ReferenceStrength = opts.strength ?? "medium";
  const block = buildStyleDnaPromptBlock(resolved.dna);
  const strengthHint = strength === "subtle"
    ? "Apply this Creative DNA SUBTLY — a light influence on art direction only."
    : strength === "strong"
      ? "Apply this Creative DNA STRONGLY — let it clearly drive the art direction (still never altering property data/agent/price/address/logo/photo)."
      : "Apply this Creative DNA at a balanced, medium strength.";
  const prompt = `${basePrompt}\n\n# CREATIVE DNA (${strength})\n${strengthHint}\n${block}`;

  if (opts.log !== false) {
    try {
      await creativeDnaRepository.logGenerationReference({
        profileId: resolved.dna.id, presetKey: resolved.dna.presetKey,
        propertyId: opts.propertyId ?? null, generationId: opts.generationId ?? null,
        strength, appliedPrompt: block, appliedRules: { source: resolved.source, name: resolved.dna.name },
      });
    } catch { /* logging is best-effort; never block generation */ }
  }
  return { prompt, applied: true, dnaName: resolved.dna.name, source: resolved.source };
}
