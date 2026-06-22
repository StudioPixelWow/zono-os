// ============================================================================
// ZONO — Visual DNA + Scoring (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Converts Marketing DNA → Visual DNA (photography/lighting/composition/etc).
// Used to build internal prompts (server-side) and to score generated visuals.
// No prompts exposed to users.
// ============================================================================

export const VISUAL_TYPE_LABELS: Record<string, string> = {
  property_hero: "תמונת גיבור נכס", lifestyle: "לייפסטייל", project: "פרויקט", neighborhood: "שכונה",
  seller_recruitment: "גיוס מוכרים", buyer_recruitment: "גיוס קונים", open_house: "בית פתוח", project_launch: "השקת פרויקט",
  investment: "השקעה", authority: "סמכות סוכן",
};

export const VARIATION_MODES: { key: string; label: string }[] = [
  { key: "more_luxury", label: "יותר יוקרה" }, { key: "more_realistic", label: "יותר ריאליסטי" }, { key: "more_lifestyle", label: "יותר לייפסטייל" },
  { key: "more_investment", label: "יותר השקעה" }, { key: "more_modern", label: "יותר מודרני" }, { key: "less_ai", label: "פחות AI" },
  { key: "different_lighting", label: "תאורה אחרת" }, { key: "different_composition", label: "קומפוזיציה אחרת" }, { key: "different_audience", label: "פוקוס קהל אחר" },
];

export interface MarketingDnaScores { luxury: number; investment: number; lifestyle: number; urgency: number; modern: number; aiGenerated: number; confidence: number }

export interface VisualDNA {
  photographyStyle: string; lightingStyle: string; compositionStyle: string; luxuryLevel: number; realismLevel: number;
  propertyPresentation: string; lifestylePresentation: string; agentPresentation: string; backgroundStyle: string; colorTreatment: string; cameraAngles: string;
  palette: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function buildVisualDNA(dna: MarketingDnaScores, colors: string[]): VisualDNA {
  const luxe = dna.luxury;
  const realism = clamp(100 - dna.aiGenerated * 0.8); // less "AI look" → higher realism
  return {
    photographyStyle: luxe >= 70 ? "אדריכלי יוקרתי, חדות גבוהה" : luxe >= 45 ? "נדל״ני נקי ומקצועי" : "טבעי ואותנטי",
    lightingStyle: luxe >= 65 ? "אור זהב רך, שעת זהב" : dna.modern >= 60 ? "אור יום נקי ובהיר" : "אור טבעי חמים",
    compositionStyle: dna.modern >= 60 ? "מינימליסטי עם מרחב נשימה" : "מאוזן עם נקודת מוקד ברורה",
    luxuryLevel: clamp(luxe), realismLevel: realism,
    propertyPresentation: luxe >= 65 ? "דגש על נוף, חללים פתוחים ומרפסת" : "דגש על ערך, חדרים ומיקום",
    lifestylePresentation: dna.lifestyle >= 55 ? "אנשים אמיתיים בסיטואציה יומיומית, לא מבוים" : "מרומז, ללא אנשים",
    agentPresentation: "מקצועי, אמין, ישראלי, ללא מראה סטוק גנרי",
    backgroundStyle: luxe >= 65 ? "רקע נקי כהה/יוקרתי" : "רקע נדל״ני אמיתי",
    colorTreatment: colors.length ? "התאמה לפלטת המותג" : luxe >= 65 ? "טונים חמים עם נגיעות זהב מאופקות" : "טונים נקיים וטבעיים",
    cameraAngles: luxe >= 65 ? "זווית רחבה, גובה עיניים, פרספקטיבה מרשימה" : "ישר ונקי, ללא עיוותים",
    palette: colors.slice(0, 4),
  };
}

// ── scoring ────────────────────────────────────────────────────────────────────
export interface VisualScores { brandMatch: number; realism: number; propertyRelevance: number; marketingRelevance: number; conversion: number; overall: number }

export function scoreVisual(visualType: string, vdna: VisualDNA, entityType: string, hasBrandColors: boolean, rejectedPatterns: string[], reason: string): VisualScores {
  const conflicts = rejectedPatterns.some((p) => p && reason.includes(p));
  const brandMatch = clamp(60 + (hasBrandColors ? 20 : 8) - (conflicts ? 30 : 0));
  const realism = vdna.realismLevel;
  const propertyRelevance = clamp(["property_hero", "lifestyle", "investment", "open_house"].includes(visualType) && (entityType === "property" || entityType === "project") ? 85 : 60);
  let marketingRelevance = 60;
  if (visualType === "project" || visualType === "project_launch") marketingRelevance += entityType === "project" ? 20 : -10;
  if (visualType === "authority" && entityType === "agent") marketingRelevance += 18;
  marketingRelevance = clamp(marketingRelevance + vdna.luxuryLevel * 0.1);
  const conversion = clamp(55 + (visualType.includes("recruitment") ? 15 : 10) + vdna.luxuryLevel * 0.1);
  const overall = clamp(brandMatch * 0.22 + realism * 0.2 + propertyRelevance * 0.2 + marketingRelevance * 0.18 + conversion * 0.2);
  return { brandMatch, realism, propertyRelevance, marketingRelevance, conversion, overall };
}

/** Map a creative output type → the visual type to generate. */
export function visualTypeForOutput(outputType: string, entityType: string, layoutId?: string): string {
  if (entityType === "project") return outputType.includes("launch") || layoutId === "project_launch" ? "project_launch" : "project";
  if (entityType === "agent" || entityType === "office") return "authority";
  const map: Record<string, string> = {
    feed_post: "property_hero", story: "lifestyle", carousel: "property_hero", reel_cover: "lifestyle",
    property_card: "property_hero", seller_recruitment_creative: "seller_recruitment", buyer_recruitment_creative: "buyer_recruitment",
  };
  if (layoutId === "investment_opportunity") return "investment";
  if (layoutId === "open_house") return "open_house";
  if (layoutId === "neighborhood_authority") return "neighborhood";
  return map[outputType] ?? "property_hero";
}
