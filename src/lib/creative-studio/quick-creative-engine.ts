// ============================================================================
// ZONO — Quick Creative Templates · Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Three fast flows (testimonial / sold / property-ad) → 4 branded render-object
// variations each (Premium Clean / Modern Sales / Trust Authority / Bold Social),
// in feed 4:5 or story 9:16. Uses brand snapshot (agent photo, logo, colors) +
// Marketing DNA. NEVER invents testimonial/property content — only uses input.
// Reuses the CreativePreview render_data shape (palette + blocks).
// ============================================================================

export type QuickType = "testimonial_post" | "sold_post" | "property_ad_post";
export const QUICK_TYPE_LABELS: Record<string, string> = { testimonial_post: "פוסט המלצה", sold_post: "פוסט נמכר", property_ad_post: "פוסט פרסום דירה" };

export const VARIANTS: { key: string; name: string }[] = [
  { key: "premium_clean", name: "Premium Clean" }, { key: "modern_sales", name: "Modern Sales" },
  { key: "trust_authority", name: "Trust / Authority" }, { key: "bold_social", name: "Bold Social" },
];

export interface BrandSnapshot {
  agentName?: string | null; agentPhoto?: string | null; agentWhatsapp?: string | null;
  officeName?: string | null; officeLogo?: string | null; colors: string[]; luxury: number; modern: number;
}
export interface QuickInput {
  // shared
  propertyImage?: string | null; neighborhood?: string | null; city?: string | null; address?: string | null; customCta?: string | null;
  // testimonial
  testimonialText?: string | null; recommenderName?: string | null; stars?: number | null; dealDate?: string | null;
  // sold
  propertyType?: string | null; salePrice?: string | null; exclusive?: boolean; saleTime?: string | null; sellerName?: string | null;
  // property ad
  importantText?: string | null; price?: string | null; rooms?: string | null; sizeSqm?: string | null; floor?: string | null; parking?: string | null; storage?: boolean; balcony?: boolean; elevator?: boolean; evacuationDate?: string | null;
}

type Palette = { bg: string; bg2: string; text: string; muted: string; accent: string; onAccent: string };
type Block = { component: string; text?: string; items?: string[]; align?: string; emphasis?: string; imageUrl?: string };
export interface QuickRender { format: string; width: number; height: number; variantKey: string; palette: Palette; blocks: Block[] }
export interface QuickScores { brandMatch: number; readability: number; realEstate: number; sellerLead: number; buyerLead: number; conversion: number; overall: number }
export interface QuickVariation { variantKey: string; variantName: string; render: QuickRender; headline: string; subheadline: string; body: string; cta: string; scores: QuickScores }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── palettes per variant (DNA-aware) ───────────────────────────────────────────
function palettes(brand: BrandSnapshot): Record<string, Palette> {
  const c = brand.colors;
  const brandBg = c[0] ?? (brand.luxury >= 65 ? "#0F3D2E" : "#5B21B6");
  const brandBg2 = c[1] ?? brandBg;
  const accent = c[2] ?? (brand.luxury >= 65 ? "#C9A14A" : "#FBBF24");
  return {
    premium_clean: { bg: "#F7F7F5", bg2: "#FFFFFF", text: "#1B1B1B", muted: "#6B6B6B", accent: brandBg, onAccent: "#FFFFFF" },
    modern_sales: { bg: brandBg2, bg2: brandBg, text: "#FFFFFF", muted: "#E9E5F5", accent, onAccent: "#1B1B1B" },
    trust_authority: { bg: "#0E2A47", bg2: "#0A1F36", text: "#F0F6FF", muted: "#AEC4DD", accent: "#4DA3FF", onAccent: "#0A1F36" },
    bold_social: { bg: brandBg, bg2: "#000000", text: "#FFFFFF", muted: "#D8D8D8", accent, onAccent: "#000000" },
  };
}

const HEADLINES: Record<QuickType, string[]> = {
  testimonial_post: ["לקוחות שממליצים מהלב", "עוד עסקה שהסתיימה בחיוך", "תודה על האמון", "כששירות טוב פוגש תוצאה"],
  sold_post: ["נמכר", "נמכר בהצלחה", "עוד נכס נמכר", "עסקה נוספת נסגרה"],
  property_ad_post: ["דירה חדשה לשיווק", "נכס חדש במערכת", "הדירה שחיכיתם לה", "הזדמנות חדשה"],
};
const CTAS: Record<QuickType, string[]> = {
  testimonial_post: ["לשיחת ייעוץ בוואטסאפ", "רוצים לדעת כמה הנכס שלכם שווה?", "דברו איתי", "גם אתם רוצים למכור נכון?"],
  sold_post: ["רוצים למכור נכון?", "לקבלת הערכת שווי לנכס שלכם", "דברו איתי בוואטסאפ", "גם הנכס שלכם יכול להיות הבא"],
  property_ad_post: ["לתיאום סיור", "לפרטים בוואטסאפ", "רוצה לקבל פרטים?", "לקביעת ביקור בנכס"],
};

function locStr(i: QuickInput): string { return i.neighborhood || i.city || ""; }

function featureRow(i: QuickInput): string[] {
  const f: string[] = [];
  if (i.rooms) f.push(`${i.rooms} חד׳`);
  if (i.sizeSqm) f.push(`${i.sizeSqm} מ״ר`);
  if (i.floor) f.push(`קומה ${i.floor}`);
  if (i.parking) f.push(`${i.parking} חניה`);
  if (i.storage) f.push("מחסן");
  if (i.balcony) f.push("מרפסת");
  if (i.elevator) f.push("מעלית");
  return f.slice(0, 6);
}

/** Build the 4 variations for a request. Hero/blocks vary by type + variant. */
export function buildQuickVariations(type: QuickType, i: QuickInput, brand: BrandSnapshot, format: string): QuickVariation[] {
  const pal = palettes(brand);
  const dims = format === "story_9_16" ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 };
  const loc = locStr(i);
  const heads = HEADLINES[type];
  const ctas = CTAS[type];
  const ctaText = (idx: number) => i.customCta || ctas[idx % ctas.length];

  return VARIANTS.map((v, idx) => {
    const palette = pal[v.key];
    const headline = headFor(type, idx, i, heads);
    const subheadline = subFor(type, i, loc);
    const body = bodyFor(type, i);
    const cta = ctaText(idx);
    const blocks = blocksFor(type, v.key, i, brand, headline, subheadline, body, cta, loc);
    const render: QuickRender = { format, width: dims.w, height: dims.h, variantKey: v.key, palette, blocks };
    const scores = scoreQuick(type, v.key, i, brand, body, cta);
    return { variantKey: v.key, variantName: v.name, render, headline, subheadline, body, cta, scores };
  });
}

function headFor(type: QuickType, idx: number, i: QuickInput, heads: string[]): string {
  if (type === "sold_post" && i.exclusive && idx === 0) return "נמכר בבלעדיות";
  if (type === "property_ad_post" && i.neighborhood) return idx === 2 ? `הזדמנות חדשה ב${i.neighborhood}` : heads[idx % heads.length];
  return heads[idx % heads.length];
}
function subFor(type: QuickType, i: QuickInput, loc: string): string {
  if (type === "sold_post") return i.address ? `ב${i.address}` : "עוד משפחה יוצאת לדרך חדשה";
  if (type === "property_ad_post") return i.address ? `למכירה ב${i.address}` : loc ? `למכירה ב${loc}` : "";
  if (type === "testimonial_post") return i.recommenderName ? `המלצה מאת ${i.recommenderName}` : "";
  return "";
}
function bodyFor(type: QuickType, i: QuickInput): string {
  // NEVER invent content — use the agent's exact text.
  if (type === "testimonial_post") return i.testimonialText ?? "";
  if (type === "property_ad_post") return i.importantText ?? "";
  if (type === "sold_post") { const bits = [i.propertyType, i.salePrice ? `נמכר ב-${i.salePrice}` : null, i.saleTime].filter(Boolean) as string[]; return bits.join(" · "); }
  return "";
}

function blocksFor(type: QuickType, variant: string, i: QuickInput, brand: BrandSnapshot, headline: string, sub: string, body: string, cta: string, loc: string): Block[] {
  const B: Block[] = [];
  const hasImg = Boolean(i.propertyImage);
  const logo = (): Block => ({ component: "logo_slot", text: brand.officeName ?? "", imageUrl: brand.officeLogo ?? undefined });
  const agent = (): Block => ({ component: "agent_card", text: [brand.agentName, brand.agentWhatsapp].filter(Boolean).join(" · ") || "הסוכן שלך", imageUrl: brand.agentPhoto ?? undefined });
  const whatsapp = (): Block => ({ component: "whatsapp_cta", text: cta, emphasis: "primary", align: "center" });
  const addr = (): Block | null => i.address ? { component: "location_badge", text: i.address } : loc ? { component: "location_badge", text: loc } : null;

  if (type === "testimonial_post") {
    if (variant === "real_estate_trust" || (variant === "modern_sales" && hasImg)) B.push({ component: "image_placeholder", text: "תמונת דירה", imageUrl: i.propertyImage ?? undefined });
    B.push({ component: "eyebrow", text: i.stars ? "★".repeat(Math.max(1, Math.min(5, i.stars))) : "המלצת לקוח" });
    B.push({ component: "headline", text: headline, emphasis: "primary" });
    if (body) B.push({ component: "subheadline", text: `״${body}״` });
    if (sub) B.push({ component: "agent_card", text: sub });
    const a = addr(); if (a) B.push(a);
    B.push(agent()); B.push(logo()); B.push(whatsapp());
    return B;
  }
  if (type === "sold_post") {
    if (hasImg) B.push({ component: "image_placeholder", text: "תמונת דירה", imageUrl: i.propertyImage ?? undefined });
    B.push({ component: "headline", text: i.exclusive ? "נמכר בבלעדיות" : "נמכר", emphasis: "primary" });
    if (sub) B.push({ component: "subheadline", text: sub });
    if (body) B.push({ component: "agent_card", text: body });
    const a = addr(); if (a) B.push(a);
    if (variant === "seller_recruitment" || variant === "bold_social") B.push({ component: "subheadline", text: "גם הנכס שלכם יכול להיות הבא" });
    B.push(agent()); B.push(logo()); B.push(whatsapp());
    return B;
  }
  // property_ad_post
  if (hasImg) B.push({ component: "image_placeholder", text: "תמונת דירה", imageUrl: i.propertyImage ?? undefined });
  B.push({ component: "eyebrow", text: "למכירה" });
  B.push({ component: "headline", text: headline, emphasis: "primary" });
  if (sub) B.push({ component: "location_badge", text: sub });
  const feats = featureRow(i); if (feats.length) B.push({ component: "property_features", items: feats });
  if (i.price) B.push({ component: "price_badge", text: i.price });
  if (body) B.push({ component: "subheadline", text: body });
  B.push(agent()); B.push(logo()); B.push(whatsapp());
  return B;
}

function scoreQuick(type: QuickType, variant: string, i: QuickInput, brand: BrandSnapshot, body: string, cta: string): QuickScores {
  const brandMatch = clamp(55 + (brand.colors.length ? 15 : 5) + (brand.officeLogo ? 10 : 0) + (brand.agentPhoto ? 8 : 0));
  const textLen = (body || "").length;
  const readability = clamp(85 - Math.max(0, textLen - 220) * 0.15);
  const hasImg = Boolean(i.propertyImage);
  const realEstate = clamp(60 + (hasImg ? 15 : 0) + (i.address ? 10 : 0) + (type === "property_ad_post" && featureRow(i).length ? 10 : 0));
  const ctaStrong = cta.includes("וואטסאפ") || cta.includes("שווי") || cta.includes("ייעוץ") || cta.includes("סיור");
  const sellerLead = clamp((type === "sold_post" ? 75 : type === "testimonial_post" ? 60 : 45) + (ctaStrong ? 12 : 0) + (variant.includes("recruitment") ? 10 : 0));
  const buyerLead = clamp((type === "property_ad_post" ? 78 : 45) + (ctaStrong ? 12 : 0) + (hasImg ? 8 : 0));
  const conversion = clamp((sellerLead + buyerLead) / 2 + (ctaStrong ? 8 : 0));
  const overall = clamp(brandMatch * 0.25 + readability * 0.2 + realEstate * 0.2 + conversion * 0.2 + Math.max(sellerLead, buyerLead) * 0.15);
  return { brandMatch, readability, realEstate, sellerLead, buyerLead, conversion, overall };
}

export type { Palette as QuickPalette };
export { clamp as quickClamp };

/** Validate required fields per flow. Returns missing field labels (Hebrew). */
export function validateRequired(type: QuickType, i: QuickInput): string[] {
  const miss: string[] = [];
  if (type === "testimonial_post") {
    if (!i.testimonialText?.trim()) miss.push("טקסט המלצה");
    if (!i.recommenderName?.trim()) miss.push("שם הממליץ");
    if (!i.address?.trim()) miss.push("כתובת עסקה");
  } else if (type === "sold_post") {
    if (!i.address?.trim()) miss.push("כתובת עסקה");
  } else if (type === "property_ad_post") {
    if (!i.address?.trim()) miss.push("כתובת הדירה");
    if (!i.importantText?.trim()) miss.push("טקסט הדירה למודעה");
  }
  return miss;
}
