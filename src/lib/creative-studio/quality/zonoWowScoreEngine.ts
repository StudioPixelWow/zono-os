// ============================================================================
// ZONO Wow Score Engine (pure) — scores every creative as if Tal from Studio
// Pixel is reviewing it: "Would Tal approve this as a premium, modern,
// high-converting real-estate creative?" Produces the full score matrix, a
// weighted overall_quality_score, and hard-blocker rejection.
// ============================================================================
import { HARD_BLOCKERS } from "./config";
import { guardHebrewRTL } from "./zonoHebrewRTLGuard";
import { evaluateTemplateRisk } from "./zonoTemplateAvoidanceService";
import { validateTruth } from "./zonoCreativeTruthValidationService";

export interface WowScoreInput {
  style: string;
  headline: string;
  subheadline?: string | null;
  body?: string | null;
  cta?: string | null;
  featureChips: string[];
  providedFeatures: string[];
  propertyType?: string | null;
  hasPrice: boolean;
  hasPropertyImage: boolean;
  hasAgentPhoto: boolean;
  hasOfficeLogo: boolean;
  brandColorCount: number;
  propertyStrengthScore: number;
  blocks: { component?: string; align?: string; emphasis?: string }[];
  /** Base validation scores from the Creative Director layer. */
  base: { scrollStop: number; antiAi: number; creativeDirector: number; rtlReadability: number };
}

export interface WowScoreResult {
  premium_score: number; modern_score: number; clean_score: number; scroll_stop_score: number;
  brand_match_score: number; real_estate_relevance_score: number; hebrew_readability_score: number;
  rtl_score: number; composition_score: number; trust_score: number; conversion_score: number;
  wow_score: number; property_truth_score: number; agent_authenticity_score: number;
  logo_authenticity_score: number; overall_quality_score: number;
  hard_blocked: boolean; block_reasons: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const PREMIUM_STYLES = new Set(["premium_clean", "trust_authority", "luxury_dark"]);
const MODERN_STYLES = new Set(["premium_clean", "modern_sales", "bold_social"]);

export function scoreWow(i: WowScoreInput): WowScoreResult {
  const text = [i.headline, i.subheadline, i.body, i.cta, ...i.featureChips].filter(Boolean).join(" ");
  const heb = guardHebrewRTL({ headline: i.headline, subheadline: i.subheadline, body: i.body, cta: i.cta });
  const tpl = evaluateTemplateRisk({ blocks: i.blocks, hasPropertyImage: i.hasPropertyImage, style: i.style, featureChipCount: i.featureChips.length });
  const truth = validateTruth({
    text, providedFeatures: i.providedFeatures, propertyType: i.propertyType, hasPrice: i.hasPrice,
    hasPropertyImage: i.hasPropertyImage, hasAgentPhoto: i.hasAgentPhoto, hasOfficeLogo: i.hasOfficeLogo,
    claimsAgentPhoto: i.hasAgentPhoto, claimsLogo: i.hasOfficeLogo,
  });

  const brandPresence = (i.brandColorCount > 0 ? 34 : 0) + (i.hasOfficeLogo ? 33 : 0) + (i.hasAgentPhoto ? 33 : 0);
  const premium_score = clamp((PREMIUM_STYLES.has(i.style) ? 70 : 58) + tpl.cleanScore * 0.18 + (i.brandColorCount > 0 ? 8 : 0) + (i.hasPropertyImage ? 6 : 0));
  const modern_score = clamp((MODERN_STYLES.has(i.style) ? 68 : 58) + i.base.antiAi * 0.2 + tpl.compositionScore * 0.12);
  const clean_score = tpl.cleanScore;
  const scroll_stop_score = clamp(i.base.scrollStop);
  const brand_match_score = clamp(0.5 * brandPresence + 0.5 * i.base.creativeDirector);
  const real_estate_relevance_score = clamp(0.6 * i.propertyStrengthScore + (i.hasPropertyImage ? 22 : 8) + Math.min(18, i.providedFeatures.length * 4));
  const composition_score = tpl.compositionScore;
  const trust_score = clamp((i.style === "trust_authority" ? 18 : 4) + 0.5 * brandPresence + 0.4 * truth.propertyTruthScore);
  const conversion_score = clamp((i.cta ? 50 : 20) + (i.style === "modern_sales" ? 16 : 6) + scroll_stop_score * 0.3);
  const wow_score = clamp(0.32 * scroll_stop_score + 0.26 * premium_score + 0.22 * composition_score + 0.2 * Math.min(100, i.propertyStrengthScore + 8));

  const overall = clamp(
    0.20 * wow_score + 0.15 * premium_score + 0.15 * modern_score + 0.15 * scroll_stop_score +
    0.10 * clean_score + 0.10 * heb.hebrewReadabilityScore + 0.10 * brand_match_score + 0.05 * conversion_score,
  );

  // Hard blockers — failing any rejects the candidate outright.
  const block_reasons: string[] = [];
  if (heb.hebrewReadabilityScore < HARD_BLOCKERS.hebrewReadabilityMin) block_reasons.push("קריאות עברית נמוכה");
  if (heb.rtlScore < HARD_BLOCKERS.rtlMin) block_reasons.push("RTL לא תקין");
  if (truth.propertyTruthScore < HARD_BLOCKERS.propertyTruthMin) block_reasons.push(...truth.violations);
  if (truth.agentAuthenticityScore < 100) block_reasons.push("תמונת סוכן מזויפת");
  if (truth.logoAuthenticityScore < 100) block_reasons.push("לוגו מזויף");
  if (tpl.canvaRisk >= 55) block_reasons.push("מראה תבנית Canva גנרי");
  if (i.base.antiAi < 60) block_reasons.push("מראה AI בולט");
  if (composition_score < 55) block_reasons.push("פריסה לא מסודרת");
  if (modern_score < 55) block_reasons.push("עיצוב מיושן");

  return {
    premium_score, modern_score, clean_score, scroll_stop_score, brand_match_score, real_estate_relevance_score,
    hebrew_readability_score: heb.hebrewReadabilityScore, rtl_score: heb.rtlScore, composition_score,
    trust_score, conversion_score, wow_score, property_truth_score: truth.propertyTruthScore,
    agent_authenticity_score: truth.agentAuthenticityScore, logo_authenticity_score: truth.logoAuthenticityScore,
    overall_quality_score: overall, hard_blocked: block_reasons.length > 0, block_reasons,
  };
}
