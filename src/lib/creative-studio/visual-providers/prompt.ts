// ============================================================================
// ZONO — Visual prompt builder (server-side, INTERNAL ONLY)
// ----------------------------------------------------------------------------
// Builds the image-generation prompt from Visual DNA + property/location +
// learning. NEVER exposed to users, never rendered in the UI.
// ============================================================================
import type { VisualDNA } from "../visual-dna";

export interface VisualPromptInput {
  visualType: string; entityType: string; entityName: string; vdna: VisualDNA;
  propertyType?: string | null; city?: string | null; neighborhood?: string | null; priceTier?: string | null;
  approvedPatterns: string[]; rejectedPatterns: string[]; variationMode?: string | null;
}

const VARIATION_HINT: Record<string, string> = {
  more_luxury: "elevate luxury and prestige", more_realistic: "maximize photorealism, avoid any AI look",
  more_lifestyle: "emphasize authentic everyday lifestyle", more_investment: "emphasize value and credibility",
  more_modern: "cleaner, more modern and minimal", less_ai: "fully photographic, no synthetic look",
  different_lighting: "use a different lighting setup", different_composition: "use a different composition and angle",
  different_audience: "shift the audience focus",
};

export function buildVisualPrompt(i: VisualPromptInput): string {
  const loc = i.neighborhood || i.city || "Israel";
  const subject = i.visualType === "property_hero" ? `a ${i.propertyType ?? "real estate property"} in ${loc}, Israel`
    : i.visualType === "lifestyle" ? `authentic Israeli lifestyle around a ${i.propertyType ?? "home"} in ${loc}`
    : i.visualType === "project" || i.visualType === "project_launch" ? `a modern Israeli residential project in ${loc}, architectural exterior`
    : i.visualType === "neighborhood" ? `the ${loc} neighborhood, local streets and atmosphere`
    : i.visualType === "investment" ? `a credible real-estate investment scene in ${loc}`
    : i.visualType === "authority" ? `a professional, trustworthy Israeli real-estate agent context (no fake stock people)`
    : i.visualType.includes("recruitment") ? `a tasteful Israeli neighborhood scene for ${i.visualType.includes("seller") ? "homeowners" : "home buyers"}`
    : `real estate marketing scene in ${loc}`;

  return [
    `Real estate marketing photograph: ${subject}.`,
    `Photography style: ${i.vdna.photographyStyle}. Lighting: ${i.vdna.lightingStyle}. Composition: ${i.vdna.compositionStyle}. Camera: ${i.vdna.cameraAngles}.`,
    `Background: ${i.vdna.backgroundStyle}. Color treatment: ${i.vdna.colorTreatment}.`,
    `Photorealism level ${i.vdna.realismLevel}/100; luxury level ${i.vdna.luxuryLevel}/100.`,
    `Must feel authentically Israeli and local${i.priceTier ? `, ${i.priceTier} segment` : ""}. Realistic Israeli architecture. No text overlays.`,
    i.approvedPatterns.length ? `Favor: ${i.approvedPatterns.join(", ")}.` : "",
    `Avoid: generic AI look, fake luxury, unrealistic buildings, AI-looking people, overused gold, irrelevant Dubai/Miami look${i.rejectedPatterns.length ? ", " + i.rejectedPatterns.join(", ") : ""}.`,
    i.variationMode && VARIATION_HINT[i.variationMode] ? `Variation: ${VARIATION_HINT[i.variationMode]}.` : "",
  ].filter(Boolean).join(" ");
}

/** A short, user-facing reason (Hebrew) — safe to show. The prompt itself is never shown. */
export function generationReason(i: VisualPromptInput): string {
  const loc = i.neighborhood || i.city || "האזור";
  const bits = [`סוג ויזואל: ${i.visualType}`, `סגנון: ${i.vdna.photographyStyle}`, `יוקרה ${i.vdna.luxuryLevel} · ריאליזם ${i.vdna.realismLevel}`, `מותאם ל${loc}`];
  if (i.variationMode) bits.push(`וריאציה: ${i.variationMode}`);
  return `ZONO יצר ויזואל זה לפי ה-DNA הוויזואלי: ${bits.join(" · ")}.`;
}
