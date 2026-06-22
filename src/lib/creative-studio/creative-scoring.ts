// ============================================================================
// ZONO — Creative Scoring + Review (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Scores a produced creative render object across brand / marketing / mobile
// readability / hierarchy / conversion / overall, and runs a review (RTL,
// Hebrew readability, hierarchy, CTA visibility, relevance, DNA alignment).
// ============================================================================
import type { RenderObject, ProductionContext } from "./production-engine";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const HEB = /[֐-׿]/;

export interface CreativeScores { brandMatch: number; marketingMatch: number; readability: number; hierarchy: number; conversion: number; overall: number }

export function scoreCreative(r: RenderObject, c: ProductionContext): CreativeScores {
  const texts = r.blocks.map((b) => b.text ?? "").join(" ");
  const hasHeb = HEB.test(texts);
  const hasCta = r.blocks.some((b) => b.component === "cta_button" || b.component === "whatsapp_cta");
  const hasHeadline = r.blocks.some((b) => b.component === "headline" && (b.text ?? "").length > 2);

  // brand match: custom/dna palette + no rejected pattern leakage
  const usesBrandPalette = r.paletteId === "brand_custom" || r.paletteId === "brand_purple" || r.paletteId === "luxury_green";
  const conflicts = c.rejectedPatterns.some((p) => p && texts.includes(p));
  const brandMatch = clamp(60 + (usesBrandPalette ? 18 : 6) + (c.dnaColors.length ? 8 : 0) - (conflicts ? 30 : 0));

  // marketing match: layout fits the angle/dna emphasis
  let marketingMatch = 60;
  if (c.luxury >= 65 && (r.layoutId === "luxury_property" || r.paletteId === "luxury_green" || r.paletteId === "noir")) marketingMatch += 18;
  if (c.investment >= 60 && r.layoutId === "investment_opportunity") marketingMatch += 16;
  if (c.seller >= 60 && r.layoutId === "seller_recruitment") marketingMatch += 16;
  if (c.entityType === "project" && r.layoutId === "project_launch") marketingMatch += 14;
  marketingMatch = clamp(marketingMatch);

  // mobile readability: block count not too dense + Hebrew
  const blockCount = r.blocks.length;
  const readability = clamp((hasHeb ? 80 : 45) - Math.max(0, blockCount - 7) * 8);

  // hierarchy: has a clear primary headline + single primary CTA
  const primaries = r.blocks.filter((b) => b.emphasis === "primary").length;
  const hierarchy = clamp(50 + (hasHeadline ? 25 : 0) + (primaries >= 1 && primaries <= 3 ? 20 : 5));

  // conversion: CTA present + urgency/cta intensity
  const conversion = clamp((hasCta ? 65 : 30) + c.urgency * 0.2 + (r.blocks.some((b) => b.component === "whatsapp_cta") ? 12 : 0));

  const overall = clamp(brandMatch * 0.22 + marketingMatch * 0.22 + readability * 0.18 + hierarchy * 0.18 + conversion * 0.2);
  return { brandMatch, marketingMatch, readability, hierarchy, conversion, overall };
}

export interface CreativeReview { rtl: boolean; hebrewReadable: boolean; hierarchyOk: boolean; ctaVisible: boolean; propertyRelevant: boolean; dnaAligned: boolean; notes: string[] }

export function reviewCreative(r: RenderObject, c: ProductionContext): CreativeReview {
  const texts = r.blocks.map((b) => b.text ?? "").join(" ");
  const rtl = HEB.test(texts);
  const hebrewReadable = rtl && !/[A-Za-z]{8,}/.test(texts);
  const hierarchyOk = r.blocks.some((b) => b.component === "headline");
  const ctaVisible = r.blocks.some((b) => b.component === "cta_button" || b.component === "whatsapp_cta");
  const propertyRelevant = ["property", "project"].includes(c.entityType) ? r.blocks.some((b) => ["property_features", "price_badge", "location_badge", "project_details", "image_placeholder"].includes(b.component)) : true;
  const dnaAligned = !c.rejectedPatterns.some((p) => p && texts.includes(p));
  const notes: string[] = [];
  if (!rtl) notes.push("חסר טקסט עברי — לוודא RTL");
  if (!ctaVisible) notes.push("אין CTA גלוי");
  if (!hierarchyOk) notes.push("אין כותרת ראשית ברורה");
  if (!dnaAligned) notes.push("זוהה דפוס שנפסל ב-DNA");
  return { rtl, hebrewReadable, hierarchyOk, ctaVisible, propertyRelevant, dnaAligned, notes };
}
