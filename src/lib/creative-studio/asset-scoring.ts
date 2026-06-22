// ============================================================================
// ZONO — Creative Asset Scoring (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Every asset → campaign match / audience match / conversion potential /
// marketing strength / overall (0-100).
// ============================================================================
import type { CreativeAsset, CampaignDnaLite } from "./asset-generator";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface AssetScores { campaignMatch: number; audienceMatch: number; conversionPotential: number; marketingStrength: number; overall: number }

export function scoreCreativeAsset(a: CreativeAsset, cdna: CampaignDnaLite, dnaConfidence: number): AssetScores {
  // campaign match: how well the asset's objective/angle aligns with campaign DNA emphasis
  let campaignMatch = 55;
  if (a.objective === "recruitment" && (cdna.seller >= 55 || cdna.buyer >= 55)) campaignMatch += 20;
  if (a.objective === "awareness" && cdna.trust >= 60) campaignMatch += 15;
  if (a.objective === "conversion" && cdna.ctaIntensity >= 60) campaignMatch += 20;
  if (a.marketing_angle.includes("יוקרה") && cdna.luxury >= 65) campaignMatch += 12;
  if (a.marketing_angle.includes("ROI") && cdna.investment >= 60) campaignMatch += 12;
  campaignMatch = clamp(campaignMatch);

  // audience match: clarity of an explicit, relevant audience
  const hasAudience = a.audience && a.audience !== "—";
  let audienceMatch = hasAudience ? 70 : 45;
  if (a.audience.includes("יוקרה") && cdna.luxury >= 65) audienceMatch += 15;
  if (a.audience.includes("משקיע") && cdna.investment >= 60) audienceMatch += 15;
  audienceMatch = clamp(audienceMatch);

  // conversion potential: CTA strength + urgency
  const conversionPotential = clamp(cdna.ctaIntensity * 0.5 + cdna.urgency * 0.3 + (a.cta_style.includes("וואטסאפ") ? 20 : 8) + (a.objective === "conversion" || a.objective === "lead_generation" ? 10 : 0));

  // marketing strength: completeness of the creative direction
  const filled = [a.visual_hook, a.copy_hook, a.marketing_angle, a.emotional_trigger, a.cta_style].filter((x) => x && x.length > 1).length;
  const marketingStrength = clamp(40 + filled * 9 + (dnaConfidence * 0.15));

  const overall = clamp(campaignMatch * 0.3 + audienceMatch * 0.2 + conversionPotential * 0.3 + marketingStrength * 0.2);
  return { campaignMatch, audienceMatch, conversionPotential, marketingStrength, overall };
}
