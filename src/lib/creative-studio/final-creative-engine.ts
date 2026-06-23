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
  };
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
