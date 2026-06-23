// ============================================================================
// ZONO — BrandDNAEngine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Decides HOW the agency should FEEL — so every agency's ads don't look the same.
// It does NOT redesign the creative architecture and does NOT change the
// CreativeBrief / Concept / ArtDirection logic. It only ENRICHES the existing
// approvedConcepts[] flow with brand intelligence, and emits structured JSON the
// DesignSystemEngine will consume next. No templates, no rendering here.
// ============================================================================
import type { FinalAdBrandAssets, ConceptTrigger } from "./final-creative-engine";

export type BrandPersonality = "bold_sales" | "quiet_luxury" | "developer" | "balanced";
const PERSONALITY_LABEL: Record<BrandPersonality, string> = {
  bold_sales: "מכירתי ונועז", quiet_luxury: "יוקרה שקטה", developer: "פרויקט / יזם", balanced: "מאוזן ומקצועי",
};

export interface BrandPalette { primary: string; secondary: string; accent: string; mode: "dark" | "light"; source: "brand" | "default" }
export interface LogoUsage { show: boolean; placement: string; size: "sm" | "md" | "lg"; recreateAsText: false }
export interface AgentImageUsage { show: "always" | "trust_concepts" | "never"; placement: string; requirePhoto: boolean; inventFace: false }

export interface BrandDNA {
  personality: BrandPersonality; personalityLabel: string;
  palette: BrandPalette;
  logoUsage: LogoUsage;
  agentImageUsage: AgentImageUsage;
  typographyDirection: string;
  visualDensity: "minimal" | "balanced" | "dense";
  luxuryLevel: "high" | "mid" | "accessible";
  ctaTone: string;
  designRestrictions: string[];
  referenceDna: { provided: boolean; notes: string };
  missingAssets: string[];
}

/** Per-concept brand guidance — advisory only. Reconciles a concept's needs with
 *  the brand personality. Does NOT change the concept's strategy or copy. */
export interface BrandGuidance {
  trigger: ConceptTrigger; showAgentImage: boolean; logoPlacement: string;
  density: "minimal" | "balanced" | "dense"; ctaTone: string; allowedEffects: string[]; notes: string;
}

const hex = (c: string | null | undefined): string | null => {
  if (!c) return null; const v = c.startsWith("#") ? c : `#${c}`;
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null;
};
/** Perceived luminance 0..1 from a #rrggbb (or #rgb) hex. */
function luminance(h: string): number {
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((x) => x + x).join("");
  const r = parseInt(s.slice(0, 2), 16) / 255, g = parseInt(s.slice(2, 4), 16) / 255, b = parseInt(s.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const DEVELOPER_RE = /פרויקט|יזם|בנייה|התחדשות|פינוי|דירות קבלן|נדל.?ן יזמי/;

export function deriveBrandPersonality(brand: FinalAdBrandAssets): BrandPersonality {
  if (DEVELOPER_RE.test(brand.officeName ?? "")) return "developer";
  if (brand.luxury >= 65) return "quiet_luxury";
  if (brand.luxury <= 42) return "bold_sales";
  return "balanced";
}

function paletteFor(brand: FinalAdBrandAssets): BrandPalette {
  const c = brand.colors.map(hex).filter((x): x is string => Boolean(x));
  if (!c.length) return { primary: "#0E0C12", secondary: "#1A1620", accent: "#E8A33D", mode: "dark", source: "default" };
  const primary = c[0];
  return { primary, secondary: c[1] ?? primary, accent: c[2] ?? c[1] ?? "#E8A33D", mode: luminance(primary) < 0.5 ? "dark" : "light", source: "brand" };
}

/** Build the agency Brand DNA. `referenceAds` is optional — when reference ads are
 *  uploaded later, their extracted DNA notes can be threaded in here. */
export function deriveBrandDNA(brand: FinalAdBrandAssets, referenceAds?: { notes?: string }[]): BrandDNA {
  const personality = deriveBrandPersonality(brand);
  const palette = paletteFor(brand);
  const luxuryLevel: BrandDNA["luxuryLevel"] = brand.luxury >= 65 ? "high" : brand.luxury <= 42 ? "accessible" : "mid";

  const logoUsage: LogoUsage = {
    show: Boolean(brand.officeLogo),
    placement: personality === "bold_sales" ? "באנר עליון" : personality === "quiet_luxury" ? "פינה עליונה (קטן)" : "פינה עליונה",
    size: personality === "bold_sales" ? "md" : "sm", recreateAsText: false,
  };
  const agentImageUsage: AgentImageUsage = {
    show: personality === "bold_sales" ? "always" : personality === "developer" ? "never" : "trust_concepts",
    placement: "פס תחתון", requirePhoto: personality === "bold_sales", inventFace: false,
  };
  const typographyDirection = personality === "quiet_luxury" ? "כותרות דקות ומאופקות, מרווח גדול, אקסנט זהב"
    : personality === "bold_sales" ? "כותרות עבות וגדולות, ניגודיות מקסימלית"
    : personality === "developer" ? "סאנס נקי ומובנה, דגש על פרטי הפרויקט" : "סאנס מודרני ומאוזן, היררכיה ברורה";
  const visualDensity: BrandDNA["visualDensity"] = personality === "quiet_luxury" ? "minimal" : personality === "bold_sales" ? "dense" : "balanced";
  const ctaTone = personality === "bold_sales" ? "ישיר ודחוף — פעולה עכשיו"
    : personality === "quiet_luxury" ? "הזמנה מעודנת ואקסקלוסיבית"
    : personality === "developer" ? "ענייני ומזמין לפרטים" : "ברור ומזמין";

  const designRestrictions = [
    "לעולם לא לשחזר לוגו כטקסט — להשתמש בקובץ הלוגו האמיתי בלבד",
    "לעולם לא להמציא פני סוכן או תמונת נכס",
    "תמונת הנכס האמיתית נשארת דומיננטית",
    personality === "quiet_luxury" ? "להימנע מצבעים רועשים; לשמור הרבה מרחב נושם" : "",
    personality === "bold_sales" ? "ניגודיות גבוהה ומחיר בולט" : "",
    personality === "developer" ? "להדגיש את הפרויקט/בניין על פני הסוכן" : "",
  ].filter(Boolean);

  const missingAssets: string[] = [];
  if (!brand.officeLogo) missingAssets.push("לוגו משרד");
  if (!brand.agentPhoto) missingAssets.push("תמונת סוכן");
  if (!brand.agentPhone) missingAssets.push("טלפון סוכן");
  if (!brand.colors.filter(Boolean).length) missingAssets.push("צבעי מותג");

  return {
    personality, personalityLabel: PERSONALITY_LABEL[personality], palette, logoUsage, agentImageUsage,
    typographyDirection, visualDensity, luxuryLevel, ctaTone, designRestrictions,
    referenceDna: { provided: Boolean(referenceAds?.length), notes: referenceAds?.map((r) => r.notes).filter(Boolean).join(" · ") ?? "" },
    missingAssets,
  };
}

const TRUST_CONCEPTS: ConceptTrigger[] = ["family", "investment", "luxury"];

/** Advisory guidance for one approved concept — reconciles concept + brand DNA.
 *  Never changes the concept's strategy/copy; only guides the DesignSystemEngine. */
export function brandGuidanceForConcept(dna: BrandDNA, trigger: ConceptTrigger): BrandGuidance {
  const showAgentImage = dna.agentImageUsage.show === "always" || (dna.agentImageUsage.show === "trust_concepts" && TRUST_CONCEPTS.includes(trigger));
  const allowedEffects = dna.personality === "quiet_luxury" ? ["soft glow", "film grain", "negative space"]
    : dna.personality === "bold_sales" ? ["high contrast", "bold price block", "accent burst"]
    : dna.personality === "developer" ? ["clean grid", "subtle depth"] : ["balanced depth", "soft gradient"];
  return {
    trigger, showAgentImage, logoPlacement: dna.logoUsage.placement, density: dna.visualDensity,
    ctaTone: dna.ctaTone, allowedEffects,
    notes: `${dna.personalityLabel}: ${showAgentImage ? "הצג סוכן" : "ללא תמונת סוכן"}, צפיפות ${dna.visualDensity}.`,
  };
}
