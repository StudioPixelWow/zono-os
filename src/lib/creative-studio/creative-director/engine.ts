// ============================================================================
// ZONO — Creative Director Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Turns the brand brief + ZONO data into an internal creative direction: chosen
// Meta-native STRATEGY, visual hook, scroll-stop reason, layout + typography
// recommendation, and a single continuous English image prompt that obeys the
// proven framework (craft rules, blacklist-safe, real-estate-truthful, exact
// Hebrew copy integrated). The prompt is INTERNAL — never shown to normal users.
// ============================================================================
import { buildHebrewBrief, type DirectorBriefInput } from "./brief-builder";

export type Strategy = "PROTAGONIST IN CONTEXT" | "BEFORE / AFTER SPLIT" | "DOCUMENT / ARTIFACT IN ENVIRONMENT" | "DATA DRAMA" | "BRUTALIST TYPOGRAPHY" | "CINEMATIC SCENE";

export interface DirectionInput extends DirectorBriefInput {
  creativeType: "testimonial_post" | "sold_post" | "property_ad_post";
  hasPropertyImage: boolean; luxury: number; urgency: number; agentName?: string | null;
  city?: string | null; neighborhood?: string | null;
  providedFeatures: string[]; // only these RE features may be referenced
}

export interface CreativeDirection {
  strategy: Strategy; visualHook: string; scrollStopReason: string; layoutRecommendation: string; typographyRecommendation: string; internalPrompt: string; brief: string;
}

function chooseStrategy(i: DirectionInput): Strategy {
  if (i.creativeType === "sold_post") return "BRUTALIST TYPOGRAPHY"; // "נמכר" dominant
  if (i.creativeType === "testimonial_post") return i.agentName ? "PROTAGONIST IN CONTEXT" : "DOCUMENT / ARTIFACT IN ENVIRONMENT";
  // property ad
  if (i.hasPropertyImage) return i.luxury >= 65 ? "CINEMATIC SCENE" : "PROTAGONIST IN CONTEXT";
  return i.urgency >= 65 ? "DATA DRAMA" : "BRUTALIST TYPOGRAPHY";
}

const LENS = { "PROTAGONIST IN CONTEXT": "35mm at f/2.0", "CINEMATIC SCENE": "50mm at f/1.8", "DOCUMENT / ARTIFACT IN ENVIRONMENT": "50mm at f/2.8", "DATA DRAMA": "35mm at f/4.0", "BRUTALIST TYPOGRAPHY": "35mm at f/4.0", "BEFORE / AFTER SPLIT": "35mm at f/2.8" } as Record<Strategy, string>;

function locPhrase(i: DirectionInput): string { return i.neighborhood || i.city || "an authentic Israeli neighborhood"; }

/** RE-safe background description — never invents views/features not provided. */
function sceneFor(i: DirectionInput): string {
  const loc = locPhrase(i);
  if (i.hasPropertyImage) return `the supplied authentic property photograph as the primary visual anchor, set in ${loc}`;
  // no image → branded RE background + agent/office, NO invented property features/views
  const agent = i.agentName ? `a trustworthy Israeli real-estate agent (${i.agentName}) portrait as a trust element` : "a branded real-estate environment";
  return `${agent} in ${loc}, an authentic Israeli real-estate context with the office branding present, golden-hour directional light`;
}

export function buildCreativeDirection(i: DirectionInput): CreativeDirection {
  const strategy = chooseStrategy(i);
  const accent = i.primaryColor || "#0F3D2E";
  const loc = locPhrase(i);
  const scene = sceneFor(i);
  const lens = LENS[strategy];

  // RE-safe feature mention: ONLY provided features.
  const feats = i.providedFeatures.filter(Boolean);
  const featClause = feats.length ? ` Render the verified property facts as crisp benefit labels: ${feats.join(", ")}.` : "";

  const dominant = i.creativeType === "sold_post" ? 'the Hebrew word "נמכר" rendered as the single dominant element filling 60%+ of the frame'
    : i.creativeType === "testimonial_post" ? "the exact Hebrew testimonial as the hero, supported by the agent portrait as a trust anchor"
    : `the headline "${i.headline}" as the dominant hook`;

  const visualHook = i.creativeType === "sold_post" ? 'המילה "נמכר" ענקית'
    : i.creativeType === "testimonial_post" ? "ציטוט ההמלצה כגיבור + פורטרט סוכן"
    : i.hasPropertyImage ? "תמונת הנכס האותנטית כעוגן" : "טיפוגרפיה בולטת על רקע נדל״ני ממותג";
  const scrollStopReason = `עצירת גלילה ב-0.3 שניות דרך ${visualHook}, אלמנט דומיננטי יחיד וצבע מבטא בודד (${accent}) על האלמנט החשוב ביותר.`;
  const layoutRecommendation = strategy === "BRUTALIST TYPOGRAPHY" ? "טיפוגרפיה ברוטליסטית מלאת-פריים, ללא חלוקת מסך, אסימטריה לפי חוק השלישים"
    : strategy === "CINEMATIC SCENE" ? "פריים קולנועי מלא, נושא מצד אחד (rule-of-thirds), טקסט משולב בסצנה"
    : strategy === "DOCUMENT / ARTIFACT IN ENVIRONMENT" ? "ארטיפקט אמיתי בסביבתו הטבעית, הטקסט חי על הארטיפקט"
    : "נושא בהקשר אותנטי, עומק שדה רדוד, טקסט בתוך הסצנה";
  const typographyRecommendation = "כותרת Heebo Black קונדנסט, ≥28% מגובה הפריים, לבן על כהה או כהה על לבן; גוף regular 1.6x; CTA כפתור מלא-רוחב tappable; CTA וואטסאפ-first.";

  // single continuous English paragraph, framework-compliant, blacklist-safe
  const internalPrompt = `[STRATEGY: ${strategy}] A cinematic photograph shot on ${lens}, motivated directional ${i.urgency >= 65 ? "cool" : "warm"} golden-hour light from the side, featuring ${scene}. The composition is asymmetric on a rule-of-thirds grid with generous negative space; ${dominant} is impossible to miss. Integrate the EXACT complete Hebrew copy, fully preserved, with correct right-to-left rendering: headline "${i.headline}"${i.subheadline ? `, subheadline "${i.subheadline}"` : ""}${feats.length ? "" : ""}${i.trust ? `, framed proof "${i.trust}"` : ""}, and a bold tappable full-width CTA button "${i.cta}".${featClause} Typography is ultra-bold condensed Hebrew (Heebo Black) for the headline at 28%+ of frame height with a single accent color ${accent} used only on the most important element; body copy in regular weight with 1.6x line spacing at 7:1 contrast; the office logo appears cleanly without overpowering. Authentic textures of real Israeli ${loc} with age and character, no studio gloss. --ar ${i.format === "story_9_16" ? "9:16" : "4:5"} --style raw`;

  return { strategy, visualHook, scrollStopReason, layoutRecommendation, typographyRecommendation, internalPrompt, brief: buildHebrewBrief(i) };
}
