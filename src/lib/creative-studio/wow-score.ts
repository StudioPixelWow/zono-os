// ============================================================================
// ZONO — WOW Score Engine V2 (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// The internal creative team (Creative Director, Art Director, Marketing
// Manager, Conversion Expert) critiques every candidate on SIX axes:
//   Luxury · Trust · Readability · Attention · Premium Feel · Visual Impact.
// Each 0–100. A design is APPROVED only when every axis ≥ threshold (95).
// Below that the pipeline must redesign (try a different master template) and
// re-score — see scoreAndPick in the concept pipeline.
//
// The scoring is PROPERTY-FIRST: a real, dominant property photo is the single
// biggest driver. Missing the real photo / logo, or a non-dominant property,
// caps the score — honestly reflecting "this looks AI-generated / card-like".
// ============================================================================
import type { DesignFamily } from "./design-system-engine";

export const WOW_THRESHOLD = 95;

export interface WowInput {
  template: DesignFamily;
  hasPropertyImage: boolean;     // real uploaded photo present
  propertyDominant: boolean;     // photo occupies the hero (≈70%) of the canvas
  hasAiScene: boolean;           // cinematic AI advertising scene behind the composite
  hasLogo: boolean;              // real uploaded logo (never recreated)
  agentShown: boolean;
  agentSmall: boolean;           // agent confined to a small bottom-corner strip
  hasPrice: boolean;
  featureCount: number;
  headlineLen: number;
  luxuryLevel: number;           // 0–100 brand luxury
  paletteDark: boolean;
  layoutApproved: boolean;       // layout-integrity passed (no overlap/crop)
  effectsCount: number;          // depth/lighting overlay layers
}

export interface WowScore {
  luxury: number; trust: number; readability: number; attention: number; premiumFeel: number; visualImpact: number;
  overall: number; approved: boolean; threshold: number; weakest: { axis: string; score: number };
  critique: { director: string; artDirector: string; marketing: string; conversion: string };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
// Master templates that read as premium real-estate campaigns (vs utility layouts).
const PREMIUM_TEMPLATES: DesignFamily[] = ["penthouse_collection", "luxury_editorial", "boutique_residence", "architectural_showcase", "urban_prestige"];

export function scoreWow(i: WowInput): WowScore {
  const premiumTemplate = PREMIUM_TEMPLATES.includes(i.template);
  const photo = i.hasPropertyImage;
  const heroPhoto = photo && i.propertyDominant;

  // Visual Impact — driven almost entirely by a dominant real property photo +
  // a cinematic scene + depth. No real photo ⇒ it can never read as a campaign.
  const visualImpact = clamp(
    (heroPhoto ? 70 : photo ? 50 : 24) + (i.hasAiScene ? 16 : 0) + Math.min(8, i.effectsCount * 3) + (i.layoutApproved ? 6 : 0),
  );
  // Premium Feel — template tier + scene + restraint (few features, dark/luxe).
  const premiumFeel = clamp(
    (premiumTemplate ? 60 : 50) + (i.hasAiScene ? 14 : 0) + (i.luxuryLevel >= 60 || i.paletteDark ? 12 : 6) + (i.featureCount <= 4 ? 8 : 2) + (heroPhoto ? 8 : 0),
  );
  // Luxury — palette/luxury level + premium template + whitespace (few features).
  const luxury = clamp(
    (i.luxuryLevel >= 70 ? 64 : i.luxuryLevel >= 50 ? 56 : 48) + (premiumTemplate ? 18 : 8) + (i.paletteDark ? 8 : 4) + (i.featureCount <= 3 ? 10 : 4) + (i.hasAiScene ? 6 : 0),
  );
  // Trust — small agent + real logo + price transparency + clean layout.
  const trust = clamp(
    58 + (i.hasLogo ? 16 : 4) + (i.agentShown && i.agentSmall ? 14 : i.agentShown ? 6 : 8) + (i.hasPrice ? 8 : 2) + (i.layoutApproved ? 6 : 0),
  );
  // Readability — integrity-passed layout + sane headline length + few features.
  const readability = clamp(
    (i.layoutApproved ? 74 : 40) + (i.headlineLen > 0 && i.headlineLen <= 34 ? 14 : i.headlineLen <= 48 ? 8 : 2) + (i.featureCount <= 4 ? 10 : 3) + (i.hasPrice ? 2 : 0),
  );
  // Attention — hero photo + price + scene + contrast.
  const attention = clamp(
    (heroPhoto ? 60 : photo ? 46 : 28) + (i.hasPrice ? 16 : 6) + (i.hasAiScene ? 10 : 0) + (i.paletteDark ? 6 : 4) + (i.layoutApproved ? 6 : 0),
  );

  // Property-first weighting: visual impact + premium feel dominate the overall.
  const overall = clamp(visualImpact * 0.26 + premiumFeel * 0.2 + luxury * 0.16 + attention * 0.16 + trust * 0.13 + readability * 0.09);
  const axes = [
    { axis: "Visual Impact", score: visualImpact }, { axis: "Premium Feel", score: premiumFeel }, { axis: "Luxury", score: luxury },
    { axis: "Attention", score: attention }, { axis: "Trust", score: trust }, { axis: "Readability", score: readability },
  ];
  const weakest = axes.reduce((a, b) => (b.score < a.score ? b : a));
  const approved = axes.every((a) => a.score >= WOW_THRESHOLD);

  const critique = {
    director: !heroPhoto ? "התמונה אינה הגיבור — יש להגדיל את תמונת הנכס לדומיננטיות של ~70%." : premiumTemplate ? "קמפיין יוקרה — הכיוון הקריאטיבי חזק." : "הכיוון תקין; ניתן לשדרג לתבנית יוקרה לתחושת קמפיין.",
    artDirector: i.hasAiScene ? "אווירה קולנועית עם עומק — נראה כמו פרויקט פרימיום." : "חסרה סצנת AI — הרקע שטוח; להוסיף עומק/תאורה.",
    marketing: i.featureCount > 4 ? "יותר מדי נתונים מתחרים על תשומת הלב — לצמצם להיררכיה ברורה." : i.hasPrice ? "מסר ומחיר ממוקדים." : "כדאי להבליט מחיר/הצעת ערך.",
    conversion: i.agentShown && !i.agentSmall ? "הסוכן דומיננטי מדי — להקטין לפינה תחתונה (אמון בלבד)." : i.layoutApproved ? "היררכיית פעולה תקינה (מחיר→CTA), ללא חפיפות." : "פריסה לא תקינה — לתקן חפיפות לפני אישור.",
  };
  return { luxury, trust, readability, attention, premiumFeel, visualImpact, overall, approved, threshold: WOW_THRESHOLD, weakest, critique };
}
