// ============================================================================
// ZONO — Hybrid Final Creative Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Turns REAL property data + REAL brand assets into a FINISHED real-estate
// social ad spec (not a background). Pipeline:
//   analyzeBrief → selectMarketingAngle (5 candidates, pick strongest)
//   → generateCopy → buildFinalAd → validateFinalAd (7 scores incl. readiness).
// All Hebrew is produced here from fixed templates — never invented by AI, so
// spelling/RTL are always correct. Assets are passed through, never fabricated.
// ============================================================================
import { CREATIVE_DNA, resolveAdPalette, type AdPalette } from "./creative-dna";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : null;
};

// ── Inputs ──────────────────────────────────────────────────────────────────
export interface FinalAdFacts {
  propertyImage?: string | null;
  city?: string | null; neighborhood?: string | null; address?: string | null;
  propertyType?: string | null; price?: string | null;
  rooms?: string | null; sizeSqm?: string | null; floor?: string | null;
  parking?: string | null; storage?: boolean; balcony?: boolean; elevator?: boolean;
  exclusive?: boolean; isNew?: boolean; urgent?: boolean;
  importantText?: string | null; customCta?: string | null;
}
export interface FinalAdBrandAssets {
  agentName?: string | null; agentPhone?: string | null; agentPhoto?: string | null;
  officeName?: string | null; officeLogo?: string | null; colors: string[]; luxury: number;
}

// ── Brief ─────────────────────────────────────────────────────────────────--
export interface CreativeBrief {
  isNew: boolean; isExclusive: boolean; isLuxury: boolean; priceAttractive: boolean; urgent: boolean;
  rooms: number | null; sizeSqm: number | null; floor: number | null; price: number | null;
  hasParking: boolean; hasStorage: boolean; hasBalcony: boolean; hasElevator: boolean;
  city: string | null; neighborhood: string | null; address: string | null; propertyType: string | null;
  strengths: string[];
  // CreativeBriefEngine: what to say (decided here, not in design).
  targetAudience: string; keyBenefit: string;
}

function deriveAudience(b: { rooms: number | null; isLuxury: boolean; priceAttractive: boolean; sizeSqm: number | null }): string {
  if (b.isLuxury) return "קונים בפלח יוקרה — איכות ומיצוב";
  if (b.priceAttractive) return "קונים מחפשי ערך והזדמנות";
  if (b.rooms != null && b.rooms >= 4) return "משפחות מחפשות בית גדל";
  if (b.rooms != null && b.rooms <= 2.5) return "זוגות צעירים / משקיעים";
  return "קונים רציניים באזור";
}
function deriveKeyBenefit(b: { isLuxury: boolean; priceAttractive: boolean; rooms: number | null; sizeSqm: number | null; neighborhood: string | null; hasBalcony: boolean }): string {
  if (b.isLuxury) return "סטנדרט מגורים גבוה ומיקום יוקרתי";
  if (b.priceAttractive) return "ערך נדל״ני מצוין ביחס למחיר";
  if (b.rooms != null && b.rooms >= 4) return "מרחב מחיה גדול למשפחה";
  if (b.hasBalcony) return "אוויר, אור ומרפסת";
  return b.neighborhood ? `מיקום מבוקש ב${b.neighborhood}` : "נכס איכותי במיקום טוב";
}

export function analyzeBrief(f: FinalAdFacts, brand: FinalAdBrandAssets): CreativeBrief {
  const price = num(f.price); const sizeSqm = num(f.sizeSqm); const rooms = num(f.rooms);
  const pricePerSqm = price && sizeSqm ? price / sizeSqm : null;
  // "Attractive" heuristic: a generous price-per-sqm or an explicit urgency hint.
  const priceAttractive = Boolean((pricePerSqm && pricePerSqm < 28000) || /הזדמנות|מחיר אטרקטיבי|מתחת/.test(f.importantText ?? ""));
  const isLuxury = brand.luxury >= 65 || /פרימיום|יוקרה|מפואר|נדל.?ן יוקרה/.test(f.importantText ?? "") || (sizeSqm != null && sizeSqm >= 140) || (price != null && price >= 4500000);
  const strengths: string[] = [];
  if (rooms) strengths.push(`${rooms} חדרים`);
  if (sizeSqm) strengths.push(`${sizeSqm} מ״ר`);
  if (f.balcony) strengths.push("מרפסת");
  if (f.parking) strengths.push("חניה");
  if (f.elevator) strengths.push("מעלית");
  if (f.neighborhood) strengths.push(f.neighborhood);
  return {
    isNew: Boolean(f.isNew), isExclusive: Boolean(f.exclusive), isLuxury, priceAttractive, urgent: Boolean(f.urgent),
    rooms, sizeSqm, floor: num(f.floor), price,
    hasParking: Boolean(f.parking), hasStorage: Boolean(f.storage), hasBalcony: Boolean(f.balcony), hasElevator: Boolean(f.elevator),
    city: f.city ?? null, neighborhood: f.neighborhood ?? null, address: f.address ?? null, propertyType: f.propertyType ?? null, strengths,
    targetAudience: deriveAudience({ rooms, isLuxury, priceAttractive, sizeSqm }),
    keyBenefit: deriveKeyBenefit({ isLuxury, priceAttractive, rooms, sizeSqm, neighborhood: f.neighborhood ?? null, hasBalcony: Boolean(f.balcony) }),
  };
}

// ── Marketing angle (5 candidates → strongest) ───────────────────────────────
export type AngleKey = "new_to_market" | "exclusive" | "opportunity" | "luxury" | "urgent";
export interface MarketingAngle { key: AngleKey; label: string; headline: string; score: number; reasoning: string }

export function selectMarketingAngle(brief: CreativeBrief): { chosen: MarketingAngle; candidates: MarketingAngle[] } {
  const loc = brief.neighborhood || brief.city || "";
  const inLoc = loc ? ` ב${loc}` : "";
  const candidates: MarketingAngle[] = [
    { key: "new_to_market", label: "נכס חדש לשיווק",
      headline: loc ? `נכס חדש לשיווק${inLoc}` : "נכס חדש לשיווק",
      score: clamp(60 + (brief.isNew ? 30 : 0) + (loc ? 8 : 0)),
      reasoning: "טריות הנכס בשוק מייצרת תחושת 'ראשונים לדעת' ומושכת קונים פעילים." },
    { key: "exclusive", label: "בלעדיות בשכונה המבוקשת",
      headline: loc ? `בלעדיות חדשה ב${loc}` : "בלעדיות חדשה בשכונה המבוקשת",
      score: clamp(55 + (brief.isExclusive ? 38 : 0) + (loc ? 7 : 0)),
      reasoning: "בלעדיות = היצע נדיר; טריגר אקסקלוסיביות שמחזק אמון ודחיפות מתונה." },
    { key: "opportunity", label: "הזדמנות במחיר",
      headline: "הזדמנות שלא נשארת הרבה זמן",
      score: clamp(50 + (brief.priceAttractive ? 40 : 0) + (brief.price ? 6 : 0)),
      reasoning: "מחיר אטרקטיבי הוא הטריגר הממיר ביותר; מדגיש ערך מיידי וסקרסיטי." },
    { key: "luxury", label: "נכס פרימיום",
      headline: "נכס פרימיום ברמה אחרת",
      score: clamp(48 + (brief.isLuxury ? 40 : 0) + (brief.sizeSqm && brief.sizeSqm >= 120 ? 6 : 0)),
      reasoning: "כשהנכס יוקרתי, מיצוב פרימיום מצדיק מחיר ומושך קהל איכותי." },
    { key: "urgent", label: "הזדמנות אחרונה",
      headline: "הזדמנות אחרונה לפני שהיא נעלמת",
      score: clamp(45 + (brief.urgent ? 42 : 0)),
      reasoning: "דחיפות מפעילה פעולה מיידית — חזק רק כשיש בסיס אמיתי למחסור." },
  ];
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return { chosen: sorted[0], candidates: sorted };
}

// ── Copy (deterministic Hebrew) ──────────────────────────────────────────────
export interface FinalCopy { headline: string; subheadline: string; location: string; cta: string }

export function generateCopy(brief: CreativeBrief, angle: MarketingAngle): FinalCopy {
  const loc = brief.neighborhood || brief.city || "";
  const location = brief.address ? brief.address : loc;
  const subBy: Record<AngleKey, string> = {
    new_to_market: loc ? `בלב ${loc} — חדש לשיווק` : "חדש לשיווק",
    exclusive: loc ? `בבלעדיות בלב ${loc}` : "בבלעדיות",
    opportunity: brief.price ? "מחיר שמדבר בעד עצמו" : "הזדמנות אמיתית",
    luxury: loc ? `נדל״ן פרימיום ב${loc}` : "נדל״ן פרימיום",
    urgent: "מי שמהסס — מפספס",
  };
  const cta = "לפרטים ותיאום ביקור בוואטסאפ";
  return { headline: angle.headline, subheadline: subBy[angle.key], location, cta };
}

// ── Final ad spec ─────────────────────────────────────────────────────────--
export interface AdFeature { icon: string; value: string; label: string }
export interface FinalAdData {
  kind: "final_ad"; angleKey: AngleKey; angleLabel: string;
  headline: string; subheadline: string; location: string; cta: string;
  badge: string | null;
  price: string | null; priceLabel: string;
  features: AdFeature[];
  agentName: string | null; agentPhone: string | null; agentPhoto: string | null;
  logoUrl: string | null; logoText: string | null;
  propertyImage: string | null;
  palette: AdPalette;
  width: number; height: number;
  // Art-direction / concept layer (added by the Concept Engine).
  composition: string; trigger: ConceptTrigger; triggerLabel: string; artDirection?: ArtDirection;
  // Observability: a full per-creative trace so a wrong creative reveals which
  // layer failed (no black-box generation). Duration is stamped by the service.
  trace?: CreativeTrace;
}

/** Layer-by-layer snapshot persisted on every creative for the inspection panel. */
export interface CreativeTrace {
  property: { propertyType: string | null; city: string | null; neighborhood: string | null; address: string | null; price: string | null; rooms: string | null; sizeSqm: string | null; floor: string | null; mediaUrl: string | null };
  brand: { agentName: string | null; agentPhone: string | null; hasAgentPhoto: boolean; officeName: string | null; hasLogo: boolean; colors: string[]; luxury: number };
  brief: { targetAudience: string; keyBenefit: string; marketingAngle: string; emotionalTrigger: string };
  concept: { name: string; trigger: ConceptTrigger; mainPromise: string; whyConvert: string };
  selectedAssets: { propertyImage: string | null; logoUrl: string | null; agentPhoto: string | null; agentPhone: string | null };
  finalPrompt: string;
  generationMs?: number; thinkingProvider?: string;
}

function buildFeatures(brief: CreativeBrief, f: FinalAdFacts): AdFeature[] {
  const out: AdFeature[] = [];
  if (brief.rooms) out.push({ icon: "Sofa", value: `${brief.rooms}`, label: "חדרים" });
  if (brief.sizeSqm) out.push({ icon: "Maximize", value: `${brief.sizeSqm}`, label: "מ״ר" });
  if (brief.hasBalcony) out.push({ icon: "Sun", value: "✓", label: "מרפסת" });
  if (brief.floor != null) out.push({ icon: "Building2", value: `${brief.floor}`, label: "קומה" });
  if (brief.hasParking) out.push({ icon: "Car", value: f.parking && /\d/.test(String(f.parking)) ? String(f.parking) : "✓", label: "חניה" });
  if (brief.hasElevator && out.length < 5) out.push({ icon: "ArrowUpDown", value: "✓", label: "מעלית" });
  if (brief.hasStorage && out.length < 5) out.push({ icon: "Package", value: "✓", label: "מחסן" });
  if (out.length < 5 && (brief.neighborhood || brief.city)) out.push({ icon: "MapPin", value: "", label: brief.neighborhood || brief.city || "" });
  return out.slice(0, 5);
}

function badgeFor(brief: CreativeBrief, angle: MarketingAngle): string | null {
  if (angle.key === "exclusive" || brief.isExclusive) return "בלעדי";
  if (angle.key === "new_to_market" || brief.isNew) return "חדש";
  if (angle.key === "luxury" || brief.isLuxury) return "פרימיום";
  if (angle.key === "opportunity" || brief.priceAttractive) return "הזדמנות";
  return null;
}

export function buildFinalAd(f: FinalAdFacts, brand: FinalAdBrandAssets, brief: CreativeBrief, angle: MarketingAngle, copy: FinalCopy): FinalAdData {
  return {
    kind: "final_ad", angleKey: angle.key, angleLabel: angle.label,
    headline: copy.headline, subheadline: copy.subheadline, location: copy.location, cta: f.customCta || copy.cta,
    badge: badgeFor(brief, angle),
    price: f.price ? formatPrice(f.price) : null, priceLabel: "מחיר",
    features: buildFeatures(brief, f),
    agentName: brand.agentName ?? null, agentPhone: brand.agentPhone ?? null, agentPhoto: brand.agentPhoto ?? null,
    logoUrl: brand.officeLogo ?? null, logoText: brand.officeName ?? null,
    propertyImage: f.propertyImage ?? null,
    palette: resolveAdPalette(brand.colors),
    width: CREATIVE_DNA.format.width, height: CREATIVE_DNA.format.height,
    composition: "editorial", trigger: "luxury", triggerLabel: CONCEPT_LABELS.luxury,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ART DIRECTION + CONCEPT ENGINE
// ----------------------------------------------------------------------------
// A senior-creative-director layer. Instead of 4 cosmetic design variations, we
// generate 4 strategically DIFFERENT advertising concepts, each driven by a
// distinct psychological trigger. Each concept runs a full art-direction pass
// (angle, emotion, visual story, hero, hierarchy, CTA strategy, composition,
// luxury level, color system) BEFORE any pixels — so the difference is the
// marketing idea, not the palette. Each concept maps to its own composition
// archetype in the renderer, so concepts look like different campaigns.
// ════════════════════════════════════════════════════════════════════════════
export type ConceptTrigger = "luxury" | "urgency" | "family" | "investment" | "price_advantage";
export const CONCEPT_LABELS: Record<ConceptTrigger, string> = {
  luxury: "יוקרה", urgency: "דחיפות", family: "אורח חיים משפחתי", investment: "השקעה חכמה", price_advantage: "יתרון מחיר",
};
/** Each concept owns a distinct composition archetype (the renderer branches on it). */
const COMPOSITION_BY_TRIGGER: Record<ConceptTrigger, string> = {
  luxury: "editorial", urgency: "urgency_banner", family: "lifestyle", investment: "data_panel", price_advantage: "price_hero",
};

/** HYBRID: spec for the AI-generated visual ENVIRONMENT only — atmosphere behind
 *  the locked real assets. The AI NEVER draws the property, agent, logo, people,
 *  or any text. imageModelPrompt is a text-free, asset-free background prompt. */
export interface AiEnvironmentSpec {
  atmosphere: string; lighting: string; backgroundTreatment: string; textures: string;
  depthLayers: boolean; framing: string; premiumEffects: string;
  imageModelPrompt: string; negativePrompt: string;
}

export interface ArtDirection {
  trigger: ConceptTrigger; marketingAngle: string; emotionalTrigger: string; visualStory: string;
  heroElement: string; focalPoint: string; composition: string; hierarchy: string[];
  imageCrop: "wide" | "tight" | "top" | "editorial"; typographyHierarchy: string; visualHierarchy: string;
  ctaStrategy: string; ctaPlacement: string; pricePlacement: string; logoPlacement: string; agentPlacement: string;
  luxuryLevel: "high" | "mid" | "accessible"; colorSystem: string; emotionalFeel: string; rationale: string;
  aiEnvironment: AiEnvironmentSpec;
}

const NEGATIVE_ENV = "no text, no hebrew, no english, no numbers, no captions, no watermark, no people, no faces, no agent, no logo, no apartment, no building, no interior, no real-estate property, no UI, no app, no card, no icons, no emojis";

function aiEnvironmentFor(trigger: ConceptTrigger): AiEnvironmentSpec {
  const base = (atmosphere: string, lighting: string, bg: string, textures: string, framing: string, fx: string): AiEnvironmentSpec => ({
    atmosphere, lighting, backgroundTreatment: bg, textures, depthLayers: true, framing, premiumEffects: fx,
    imageModelPrompt: `Premium abstract advertising BACKGROUND ENVIRONMENT only, 1:1 square. ${atmosphere}. Lighting: ${lighting}. ${bg}. Texture: ${textures}. Framing: ${framing}. Effects: ${fx}. Leave generous clean negative space in the lower third and one corner for real assets and text to be overlaid later. Cinematic, premium, modern, high-end advertising mood. ${NEGATIVE_ENV}.`,
    negativePrompt: NEGATIVE_ENV,
  });
  const map: Record<ConceptTrigger, AiEnvironmentSpec> = {
    luxury: base("Quiet opulent ambiance, dark editorial elegance", "soft cinematic rim light, gentle gold spill", "deep charcoal gradient with subtle bokeh depth", "fine marble / brushed metal hints", "wide breathing margins, museum-like calm", "soft gold glow, delicate film grain, glass reflections"),
    urgency: base("High-energy bold environment, dynamic motion", "high-contrast dramatic spotlight", "deep black-to-ember gradient with diagonal light streaks", "sharp angular light shards", "tight punchy frame, strong diagonal", "vivid accent glow, motion-blur streaks, high contrast"),
    family: base("Warm welcoming home ambiance", "soft golden-hour warmth", "warm cream-to-teal gradient with gentle vignette", "soft fabric / warm wood hints", "cozy balanced frame", "soft warm glow, gentle haze, rounded soft light"),
    investment: base("Confident structured ambiance, data-led calm", "clean even studio light", "deep navy gradient with subtle grid depth", "matte glass / precise geometric hints", "structured grid frame", "subtle neon-green accent glow, clean reflections"),
    price_advantage: base("Direct confident value ambiance", "clear bright key light", "rich dark gradient with a single bright focal pool", "clean smooth surfaces", "centered focal frame", "bright accent burst, crisp clean glow"),
  };
  return map[trigger];
}

function artDirectionFor(trigger: ConceptTrigger, brief: CreativeBrief): ArtDirection {
  const loc = brief.neighborhood || brief.city || "האזור";
  const env = aiEnvironmentFor(trigger);
  const map: Record<ConceptTrigger, Omit<ArtDirection, "aiEnvironment">> = {
    luxury: {
      trigger, marketingAngle: "מיצוב פרימיום — בית שמגדיר סטטוס", emotionalTrigger: "שאיפה ויוקרה", visualStory: "רגע קולנועי, שקט, מכובד",
      heroElement: "תמונת הנכס במלוא הבמה עם הרבה אוויר שלילי", focalPoint: "הכותרת והנכס במרכז קולנועי", composition: "editorial",
      hierarchy: ["תמונה", "כותרת", "מחיר עדין", "סוכן מינימלי"], imageCrop: "editorial",
      typographyHierarchy: "כותרת דקה ומאופקת, מרווח גדול, אקסנט זהב", visualHierarchy: "תמונה → כותרת → מחיר עדין → סוכן מינימלי",
      ctaStrategy: "הזמנה לסיור פרטי (אקסקלוסיבי)", ctaPlacement: "תחתון-מרכזי עדין", pricePlacement: "פינה עליונה מאופקת", logoPlacement: "פינה עליונה", agentPlacement: "תחתון מינימלי",
      luxuryLevel: "high", colorSystem: "פחם + זהב", emotionalFeel: "יוקרה שקטה ובטוחה", rationale: "כשהנכס יוקרתי, מיצוב פרימיום מצדיק מחיר ומושך קהל איכותי.",
    },
    urgency: {
      trigger, marketingAngle: "מחסור וזמן — לפני שייעלם", emotionalTrigger: "פחד מהחמצה (FOMO)", visualStory: "מתח, תנועה, אנרגיה גבוהה",
      heroElement: "באנר עליון נועז + תמונה עם קונטרסט גבוה", focalPoint: "כותרת הדחיפות + המחיר", composition: "urgency_banner",
      hierarchy: ["באנר דחיפות", "מחיר בולט", "CTA מיידי", "תמונה"], imageCrop: "tight",
      typographyHierarchy: "כותרת ענקית ובועטת, ניגודיות מקסימלית", visualHierarchy: "באנר דחיפות → מחיר בולט → CTA מיידי",
      ctaStrategy: "פעולה מיידית עכשיו", ctaPlacement: "תחתון מלא ובולט", pricePlacement: "מרכזי דומיננטי", logoPlacement: "באנר עליון", agentPlacement: "תחתון לצד CTA",
      luxuryLevel: "accessible", colorSystem: "שחור + כתום/אדום", emotionalFeel: "דחיפות חדה ואנרגטית", rationale: "דחיפות מפעילה פעולה מיידית כשיש בסיס אמיתי למחסור.",
    },
    family: {
      trigger, marketingAngle: "הבית שבו המשפחה גדלה", emotionalTrigger: "חום, שייכות, ביטחון", visualStory: "אווירה ביתית וחמה",
      heroElement: "תמונת הנכס עם שכבה רכה וחמה", focalPoint: "התמונה החמה + הכותרת", composition: "lifestyle",
      hierarchy: ["תמונה", "סיפור", "מאפיינים", "סוכן בולט"], imageCrop: "wide",
      typographyHierarchy: "כותרת ידידותית ועגולה, צ'יפים רכים", visualHierarchy: "תמונה → סיפור → מאפיינים → סוכן בולט (אמון)",
      ctaStrategy: "הזמנה חמה לביקור", ctaPlacement: "תחתון רך", pricePlacement: "אחרי המאפיינים", logoPlacement: "פינה על התמונה", agentPlacement: "תחתון בולט (אמון)",
      luxuryLevel: "mid", colorSystem: "קרם חם + טורקיז", emotionalFeel: "חום ביתי ומזמין", rationale: `${brief.rooms ?? "מרווח"} חדרים ב${loc} — מתאים בול למשפחות.`,
    },
    investment: {
      trigger, marketingAngle: "השקעה חכמה עם פוטנציאל", emotionalTrigger: "ביטחון כלכלי והיגיון", visualStory: "נתונים, סדר, ביטחון",
      heroElement: "תמונה + פאנל נתונים מובנה (מ״ר/חדרים/מחיר)", focalPoint: "פאנל הנתונים והמחיר", composition: "data_panel",
      hierarchy: ["מחיר/מ״ר", "נתונים", "תמונה", "CTA אנליטי"], imageCrop: "top",
      typographyHierarchy: "סאנס נקי, מספרים דומיננטיים, גריד", visualHierarchy: "מחיר/מ״ר → נתונים → תמונה → CTA אנליטי",
      ctaStrategy: "הזמנה לניתוח השקעה", ctaPlacement: "תחתון לצד הסוכן", pricePlacement: "כרטיס נתון ראשי", logoPlacement: "פינה על התמונה", agentPlacement: "תחתון קומפקטי",
      luxuryLevel: "mid", colorSystem: "נייבי + ירוק", emotionalFeel: "ביטחון רציונלי ומסודר", rationale: "מסגור תשואה/ערך מדבר אל קונים רציונליים ומשקיעים.",
    },
    price_advantage: {
      trigger, marketingAngle: "ערך מיידי — המחיר מדבר", emotionalTrigger: "תחושת מציאה", visualStory: "ישיר, ברור, משכנע",
      heroElement: "המחיר ככוכב הראשי, התמונה תומכת", focalPoint: "המחיר הענק", composition: "price_hero",
      hierarchy: ["מחיר", "הזדמנות", "תמונה", "CTA"], imageCrop: "top",
      typographyHierarchy: "מחיר ענק דומיננטי, כותרת קצרה", visualHierarchy: "מחיר → הזדמנות → תמונה → CTA",
      ctaStrategy: "פרטים מהירים עכשיו", ctaPlacement: "תחתון בולט", pricePlacement: "מרכז-במה ענק", logoPlacement: "פינה על התמונה", agentPlacement: "תחתון קומפקטי",
      luxuryLevel: "accessible", colorSystem: "כהה + ירוק/זהב", emotionalFeel: "ערך ישיר ומשכנע", rationale: "מחיר אטרקטיבי הוא הטריגר הממיר ביותר.",
    },
  };
  return { ...map[trigger], aiEnvironment: env };
}

function conceptCopy(trigger: ConceptTrigger, brief: CreativeBrief): FinalCopy {
  const loc = brief.neighborhood || brief.city || "";
  const inLoc = loc ? ` ב${loc}` : "";
  const location = brief.address || loc;
  const byTrigger: Record<ConceptTrigger, { headline: string; sub: string; cta: string }> = {
    luxury: { headline: loc ? `הבית שמגדיר סטנדרט${inLoc}` : "נכס פרימיום ברמה אחרת", sub: loc ? `נדל״ן יוקרה · ${loc}` : "נדל״ן יוקרה", cta: "לתיאום סיור פרטי" },
    urgency: { headline: "הזדמנות אחרונה — לפני שתיעלם", sub: "מי שמהסס מפספס", cta: "תפסו עכשיו בוואטסאפ" },
    family: { headline: "הבית שבו המשפחה גדלה", sub: loc ? `${brief.rooms ?? ""} חדרים · ${loc}`.trim() : "מרחב לכל המשפחה", cta: "בואו לראות את הבית" },
    investment: { headline: "השקעה חכמה שמחזירה את עצמה", sub: loc ? `תשואה · מיקום · פוטנציאל ב${loc}` : "תשואה · מיקום · פוטנציאל", cta: "לקבלת ניתוח השקעה" },
    price_advantage: { headline: "המחיר שמדבר בעד עצמו", sub: loc ? `הזדמנות אמיתית ב${loc}` : "הזדמנות אמיתית", cta: "לפרטים מהירים בוואטסאפ" },
  };
  const c = byTrigger[trigger];
  return { headline: c.headline, subheadline: c.sub, location, cta: c.cta };
}

function colorSystemFor(trigger: ConceptTrigger, brandColors: string[]): AdPalette {
  const brand = resolveAdPalette(brandColors);
  const brandAccent = brandColors.filter(Boolean).length >= 2 ? brand.accent : null;
  const sys: Record<ConceptTrigger, AdPalette> = {
    luxury: { bg: "#0C0A10", bg2: "#1C1726", accent: brandAccent ?? "#D9A441", accent2: "#F0CE84", text: "#FFFFFF", muted: "#C9C2D4", onAccent: "#1A1206" },
    urgency: { bg: "#160808", bg2: "#2C0E0E", accent: "#FF5A36", accent2: "#FF8A5B", text: "#FFFFFF", muted: "#F2CFC8", onAccent: "#1A0A06" },
    family: { bg: "#16242B", bg2: "#1F3A3A", accent: "#39B6A6", accent2: "#8AD9CD", text: "#FFFFFF", muted: "#CDE3E2", onAccent: "#06231F" },
    investment: { bg: "#08172B", bg2: "#0E2440", accent: "#2FC777", accent2: "#7FE3AC", text: "#F2F7FF", muted: "#AEC4DD", onAccent: "#04210F" },
    price_advantage: { bg: "#0E0C12", bg2: "#1A1620", accent: brandAccent ?? "#2FC777", accent2: "#8BE0AE", text: "#FFFFFF", muted: "#C9C4D2", onAccent: "#04210F" },
  };
  return sys[trigger];
}

/** Pick the 4 most relevant — yet strategically distinct — concepts for this property. */
export function selectConcepts(brief: CreativeBrief): ConceptTrigger[] {
  const score: Record<ConceptTrigger, number> = {
    luxury: 40 + (brief.isLuxury ? 45 : 0) + (brief.sizeSqm && brief.sizeSqm >= 130 ? 10 : 0),
    urgency: 38 + (brief.urgent ? 45 : 0) + (brief.isExclusive ? 12 : 0),
    family: 40 + (brief.rooms != null && brief.rooms >= 4 ? 40 : 0) + (brief.hasBalcony ? 6 : 0),
    investment: 38 + (brief.priceAttractive ? 28 : 0) + (brief.rooms != null && brief.rooms <= 3 ? 16 : 0),
    price_advantage: 40 + (brief.priceAttractive ? 45 : 0) + (brief.price ? 8 : 0),
  };
  const order: ConceptTrigger[] = ["luxury", "urgency", "family", "investment", "price_advantage"];
  const ranked = [...order].sort((a, b) => score[b] - score[a]);
  return ranked.slice(0, 4);
}

export interface ConceptPlan {
  trigger: ConceptTrigger; triggerLabel: string; artDirection: ArtDirection; ad: FinalAdData; scores: FinalAdScores;
  // MarketingConceptEngine contract: strategy, not cosmetics.
  conceptName: string; psychologicalTrigger: string; mainPromise: string; visualDirection: string; whyConvert: string;
  targetAudience: string; keyBenefit: string;
}

const MAIN_PROMISE: Record<ConceptTrigger, string> = {
  luxury: "בית שמשדר סטטוס ואיכות חיים גבוהה", urgency: "ההזדמנות הזו לא תחזור — פועלים עכשיו",
  family: "המרחב הבטוח שבו המשפחה גדלה", investment: "נכס שמייצר ערך לאורך זמן", price_advantage: "ערך נדל״ני יוצא דופן ביחס למחיר",
};
const WHY_CONVERT: Record<ConceptTrigger, string> = {
  luxury: "קהל היוקרה מגיב למיצוב ולאיפוק; הוא קונה תחושת בלעדיות.",
  urgency: "מחסור + זמן מייצרים פעולה מיידית כשהבסיס אמיתי.",
  family: "רגש של בית ושייכות מניע משפחות להגיע לביקור.",
  investment: "מסגור תשואה/ערך משכנע קונים רציונליים ומשקיעים.",
  price_advantage: "מחיר אטרקטיבי הוא הטריגר עם שיעור ההמרה הגבוה ביותר.",
};

function buildConceptAd(f: FinalAdFacts, brand: FinalAdBrandAssets, brief: CreativeBrief, trigger: ConceptTrigger): FinalAdData {
  const copy = conceptCopy(trigger, brief);
  const artDirection = artDirectionFor(trigger, brief);
  const trace: CreativeTrace = {
    property: { propertyType: f.propertyType ?? null, city: f.city ?? null, neighborhood: f.neighborhood ?? null, address: f.address ?? null, price: f.price ?? null, rooms: f.rooms ?? null, sizeSqm: f.sizeSqm ?? null, floor: f.floor ?? null, mediaUrl: f.propertyImage ?? null },
    brand: { agentName: brand.agentName ?? null, agentPhone: brand.agentPhone ?? null, hasAgentPhoto: Boolean(brand.agentPhoto), officeName: brand.officeName ?? null, hasLogo: Boolean(brand.officeLogo), colors: brand.colors.filter(Boolean), luxury: brand.luxury },
    brief: { targetAudience: brief.targetAudience, keyBenefit: brief.keyBenefit, marketingAngle: artDirection.marketingAngle, emotionalTrigger: artDirection.emotionalTrigger },
    concept: { name: CONCEPT_LABELS[trigger], trigger, mainPromise: MAIN_PROMISE[trigger], whyConvert: WHY_CONVERT[trigger] },
    selectedAssets: { propertyImage: f.propertyImage ?? null, logoUrl: brand.officeLogo ?? null, agentPhoto: brand.agentPhoto ?? null, agentPhone: brand.agentPhone ?? null },
    finalPrompt: artDirection.aiEnvironment.imageModelPrompt,
  };
  const ad: FinalAdData = {
    kind: "final_ad", angleKey: "new_to_market", angleLabel: CONCEPT_LABELS[trigger],
    headline: copy.headline, subheadline: copy.subheadline, location: copy.location, cta: f.customCta || copy.cta,
    badge: triggerBadge(trigger, brief),
    price: f.price ? formatPrice(f.price) : null, priceLabel: "מחיר",
    features: buildFeatures(brief, f),
    agentName: brand.agentName ?? null, agentPhone: brand.agentPhone ?? null, agentPhoto: brand.agentPhoto ?? null,
    logoUrl: brand.officeLogo ?? null, logoText: brand.officeName ?? null,
    propertyImage: f.propertyImage ?? null,
    palette: colorSystemFor(trigger, brand.colors),
    width: CREATIVE_DNA.format.width, height: CREATIVE_DNA.format.height,
    composition: COMPOSITION_BY_TRIGGER[trigger], trigger, triggerLabel: CONCEPT_LABELS[trigger],
    artDirection, trace,
  };
  return ad;
}

function triggerBadge(trigger: ConceptTrigger, brief: CreativeBrief): string | null {
  if (trigger === "urgency") return "הזדמנות אחרונה";
  if (trigger === "luxury") return "פרימיום";
  if (trigger === "price_advantage") return "מחיר אטרקטיבי";
  if (trigger === "family") return brief.rooms ? `${brief.rooms} חדרים` : "למשפחה";
  if (trigger === "investment") return "השקעה";
  return null;
}

/** A persisted, renderable concept. We NEVER collapse to a single winner — every
 *  approved concept stays available so different channels (FB / IG feed / stories
 *  / WhatsApp / website / landing / retargeting) can each render the concept that
 *  fits. The renderer only executes these; it never invents a concept. */
export interface ApprovedConcept {
  concept: string; trigger: ConceptTrigger; headline: string; cta: string;
  artDirection: ArtDirection; score: number; plan: ConceptPlan;
}

/** Approval gate: a concept is approved (renderable) when it has no hard blockers
 *  (e.g. missing real property image). All approved concepts are kept, ranked by
 *  readiness — none are destroyed. Falls back to all concepts if none clear. */
export function approveConcepts(concepts: ConceptPlan[]): ApprovedConcept[] {
  const passing = concepts.filter((c) => c.scores.blockers.length === 0);
  const pool = passing.length ? passing : concepts;
  return [...pool]
    .sort((a, b) => b.scores.finalPostReadiness - a.scores.finalPostReadiness)
    .map((c) => ({ concept: c.conceptName, trigger: c.trigger, headline: c.ad.headline, cta: c.ad.cta, artDirection: c.artDirection, score: c.scores.finalPostReadiness, plan: c }));
}

/** The Concept Engine: 4 strategically distinct, art-directed concepts. Returns
 *  ALL approved concepts (renderable across channels) — not just a winner. */
export function directConcepts(f: FinalAdFacts, brand: FinalAdBrandAssets): { brief: CreativeBrief; concepts: ConceptPlan[]; approvedConcepts: ApprovedConcept[] } {
  const brief = analyzeBrief(f, brand);
  const triggers = selectConcepts(brief);
  const concepts: ConceptPlan[] = triggers.map((trigger) => {
    const ad = buildConceptAd(f, brand, brief, trigger);
    const adr = ad.artDirection!;
    return {
      trigger, triggerLabel: CONCEPT_LABELS[trigger], artDirection: adr, ad, scores: validateFinalAd(ad),
      conceptName: CONCEPT_LABELS[trigger], psychologicalTrigger: adr.emotionalTrigger, mainPromise: MAIN_PROMISE[trigger],
      visualDirection: `${adr.visualStory} · ${adr.aiEnvironment.atmosphere}`, whyConvert: WHY_CONVERT[trigger],
      targetAudience: brief.targetAudience, keyBenefit: brief.keyBenefit,
    };
  });
  return { brief, concepts, approvedConcepts: approveConcepts(concepts) };
}

function formatPrice(raw: string): string {
  const n = num(raw);
  if (n == null) return raw;
  return `₪${n.toLocaleString("he-IL")}`;
}

// ── Validation (7 scores incl. finalPostReadiness) ───────────────────────────
export interface FinalAdScores {
  assetAuthenticity: number; hebrewAccuracy: number; rtlCorrectness: number;
  visualHierarchy: number; conversionStrength: number; brandConsistency: number;
  finalPostReadiness: number; warnings: string[]; blockers: string[];
}

const hasLatin = (s: string) => /[A-Za-z]{3,}/.test(s);

export function validateFinalAd(ad: FinalAdData): FinalAdScores {
  const warnings: string[] = []; const blockers: string[] = [];

  // Asset authenticity: real assets present (we never fabricate). Image is core.
  if (!ad.propertyImage) blockers.push("חסרה תמונת נכס אמיתית");
  if (!ad.agentPhoto) warnings.push("חסרה תמונת סוכן — מומלץ להעלות");
  if (!ad.logoUrl) warnings.push("חסר לוגו משרד");
  if (!ad.agentPhone) warnings.push("חסר מספר טלפון לסוכן");
  const assetAuthenticity = clamp((ad.propertyImage ? 45 : 0) + (ad.agentPhoto ? 22 : 0) + (ad.logoUrl ? 18 : 0) + (ad.agentPhone ? 15 : 0));

  // Hebrew accuracy: deterministic templates → high; deduct for stray latin.
  const hebrewAccuracy = clamp(100 - (hasLatin(ad.headline) ? 18 : 0) - (hasLatin(ad.subheadline) ? 10 : 0));

  // RTL correctness: required text fields present and non-empty.
  const rtlCorrectness = clamp(70 + (ad.headline ? 15 : 0) + (ad.cta ? 15 : 0));

  // Visual hierarchy: dominant headline + hero + price + cta + features.
  const visualHierarchy = clamp(40 + (ad.headline ? 16 : 0) + (ad.propertyImage ? 18 : 0) + (ad.price ? 12 : 0) + (ad.cta ? 8 : 0) + Math.min(6, ad.features.length * 2));

  // Conversion strength: strong CTA + price confidence + short headline + scannable features.
  const shortHead = ad.headline.split(/\s+/).length <= 6;
  const conversionStrength = clamp(45 + (ad.cta ? 18 : 0) + (ad.price ? 16 : 0) + (shortHead ? 12 : 0) + Math.min(9, ad.features.length * 3));

  // Brand consistency: brand colors + logo + agent.
  const realColors = ad.palette.bg !== "#0E0C12"; // non-default kit ⇒ real brand colors
  const brandConsistency = clamp(50 + (realColors ? 22 : 6) + (ad.logoUrl ? 16 : 0) + (ad.agentName ? 12 : 0));

  // Final readiness: weighted; hard blockers cap it low.
  let finalPostReadiness = clamp(
    assetAuthenticity * 0.22 + hebrewAccuracy * 0.14 + rtlCorrectness * 0.1 +
    visualHierarchy * 0.2 + conversionStrength * 0.2 + brandConsistency * 0.14,
  );
  if (blockers.length) finalPostReadiness = Math.min(finalPostReadiness, 40);

  return { assetAuthenticity, hebrewAccuracy, rtlCorrectness, visualHierarchy, conversionStrength, brandConsistency, finalPostReadiness, warnings, blockers };
}

/** One-shot orchestration: facts + brand → { brief, angles, copy, ad, scores }. */
export function composeFinalAd(f: FinalAdFacts, brand: FinalAdBrandAssets): {
  brief: CreativeBrief; chosenAngle: MarketingAngle; angleCandidates: MarketingAngle[]; copy: FinalCopy; ad: FinalAdData; scores: FinalAdScores;
} {
  const brief = analyzeBrief(f, brand);
  const { chosen, candidates } = selectMarketingAngle(brief);
  const copy = generateCopy(brief, chosen);
  const ad = buildFinalAd(f, brand, brief, chosen, copy);
  const scores = validateFinalAd(ad);
  return { brief, chosenAngle: chosen, angleCandidates: candidates, copy, ad, scores };
}

export const FINAL_POST_READINESS_THRESHOLD = 90;
