// ============================================================================
// ZONO — Creative Production Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Marketing DNA + Campaign DNA + Creative Asset + Copy + property data →
// 4-8 REAL creative variants as STRUCTURED, EDITABLE render objects (HTML/CSS
// render data — not images). Includes a RE layout library + component library
// + DNA-driven palettes + format dimensions. AI image fill is the next phase
// (visual blocks carry placeholders here).
// ============================================================================

export const OUTPUT_TYPE_LABELS: Record<string, string> = {
  feed_post: "פוסט פיד", story: "סטורי", carousel: "קרוסלה", reel_cover: "כריכת ריל", banner: "באנר",
  whatsapp_image: "תמונת וואטסאפ", property_card: "כרטיס נכס", project_card: "כרטיס פרויקט",
  seller_recruitment_creative: "קריאייטיב גיוס מוכרים", buyer_recruitment_creative: "קריאייטיב גיוס קונים",
};

// ── formats ──────────────────────────────────────────────────────────────────
export const FORMAT_DIMS: Record<string, { w: number; h: number }> = {
  feed_post: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 }, carousel: { w: 1080, h: 1350 },
  reel_cover: { w: 1080, h: 1920 }, banner: { w: 1200, h: 628 }, whatsapp_image: { w: 1080, h: 1080 },
  property_card: { w: 1080, h: 1080 }, project_card: { w: 1080, h: 1080 },
  seller_recruitment_creative: { w: 1080, h: 1350 }, buyer_recruitment_creative: { w: 1080, h: 1350 },
};

// ── palettes (DNA-driven) ──────────────────────────────────────────────────────
export interface Palette { id: string; label: string; bg: string; bg2: string; text: string; muted: string; accent: string; onAccent: string }
export const PALETTES: Record<string, Palette> = {
  luxury_green: { id: "luxury_green", label: "ירוק יוקרה", bg: "#0F3D2E", bg2: "#0A2A20", text: "#F4F1E8", muted: "#C9C2AE", accent: "#C9A14A", onAccent: "#0F3D2E" },
  noir: { id: "noir", label: "נואר", bg: "#141414", bg2: "#000000", text: "#FFFFFF", muted: "#B8B8B8", accent: "#D4AF37", onAccent: "#141414" },
  brand_purple: { id: "brand_purple", label: "סגול ZONO", bg: "#5B21B6", bg2: "#7C3AED", text: "#FFFFFF", muted: "#E9D5FF", accent: "#FBBF24", onAccent: "#3B0764" },
  clean_light: { id: "clean_light", label: "נקי בהיר", bg: "#F7F7F5", bg2: "#FFFFFF", text: "#1B1B1B", muted: "#6B6B6B", accent: "#0F3D2E", onAccent: "#FFFFFF" },
  trust_blue: { id: "trust_blue", label: "כחול אמון", bg: "#0E2A47", bg2: "#0A1F36", text: "#F0F6FF", muted: "#AEC4DD", accent: "#4DA3FF", onAccent: "#0A1F36" },
};

// ── component + layout library ─────────────────────────────────────────────────
export type ComponentType =
  | "eyebrow" | "headline" | "subheadline" | "cta_button" | "whatsapp_cta" | "price_badge"
  | "location_badge" | "property_features" | "agent_card" | "project_details" | "developer_block"
  | "investment_block" | "testimonial_block" | "image_placeholder" | "logo_slot";

export interface RenderBlock { component: ComponentType; text?: string; items?: string[]; align?: "start" | "center" | "end"; emphasis?: "primary" | "secondary" }
export interface RenderObject {
  format: string; width: number; height: number; layoutId: string; layoutLabel: string; paletteId: string;
  palette: Palette; blocks: RenderBlock[];
}

export interface LayoutDef { id: string; label: string; appliesTo: string[]; blocks: { component: ComponentType; role?: string }[] }
export const LAYOUTS: LayoutDef[] = [
  { id: "property_hero", label: "גיבור נכס", appliesTo: ["feed_post", "property_card", "carousel"], blocks: [{ component: "image_placeholder" }, { component: "eyebrow", role: "type" }, { component: "headline", role: "headline" }, { component: "property_features" }, { component: "price_badge", role: "price" }, { component: "location_badge", role: "location" }, { component: "whatsapp_cta", role: "cta" }] },
  { id: "luxury_property", label: "נכס יוקרה", appliesTo: ["feed_post", "story", "property_card"], blocks: [{ component: "image_placeholder" }, { component: "headline", role: "headline" }, { component: "subheadline", role: "subheadline" }, { component: "location_badge", role: "location" }, { component: "cta_button", role: "cta" }] },
  { id: "project_launch", label: "השקת פרויקט", appliesTo: ["feed_post", "project_card", "story"], blocks: [{ component: "logo_slot" }, { component: "eyebrow", role: "type" }, { component: "headline", role: "headline" }, { component: "project_details" }, { component: "developer_block" }, { component: "whatsapp_cta", role: "cta" }] },
  { id: "seller_recruitment", label: "גיוס מוכרים", appliesTo: ["feed_post", "seller_recruitment_creative", "story"], blocks: [{ component: "eyebrow", role: "type" }, { component: "headline", role: "headline" }, { component: "subheadline", role: "subheadline" }, { component: "cta_button", role: "cta" }] },
  { id: "buyer_recruitment", label: "גיוס קונים", appliesTo: ["feed_post", "buyer_recruitment_creative", "story"], blocks: [{ component: "headline", role: "headline" }, { component: "subheadline", role: "subheadline" }, { component: "whatsapp_cta", role: "cta" }] },
  { id: "neighborhood_authority", label: "סמכות שכונתית", appliesTo: ["feed_post", "carousel"], blocks: [{ component: "eyebrow", role: "location" }, { component: "headline", role: "headline" }, { component: "agent_card" }, { component: "cta_button", role: "cta" }] },
  { id: "agent_branding", label: "מיתוג סוכן", appliesTo: ["feed_post", "story"], blocks: [{ component: "image_placeholder" }, { component: "headline", role: "headline" }, { component: "agent_card" }, { component: "whatsapp_cta", role: "cta" }] },
  { id: "investment_opportunity", label: "הזדמנות השקעה", appliesTo: ["feed_post", "property_card"], blocks: [{ component: "eyebrow", role: "type" }, { component: "headline", role: "headline" }, { component: "investment_block" }, { component: "price_badge", role: "price" }, { component: "whatsapp_cta", role: "cta" }] },
  { id: "lifestyle_property", label: "נכס לייפסטייל", appliesTo: ["feed_post", "story", "reel_cover"], blocks: [{ component: "image_placeholder" }, { component: "headline", role: "headline" }, { component: "subheadline", role: "subheadline" }, { component: "cta_button", role: "cta" }] },
  { id: "open_house", label: "בית פתוח", appliesTo: ["feed_post", "story"], blocks: [{ component: "eyebrow", role: "type" }, { component: "headline", role: "headline" }, { component: "location_badge", role: "location" }, { component: "whatsapp_cta", role: "cta" }] },
  { id: "price_reduction", label: "הורדת מחיר", appliesTo: ["feed_post", "story"], blocks: [{ component: "eyebrow", role: "type" }, { component: "headline", role: "headline" }, { component: "price_badge", role: "price" }, { component: "cta_button", role: "cta" }] },
  { id: "sold_property", label: "נמכר", appliesTo: ["feed_post", "story"], blocks: [{ component: "eyebrow", role: "type" }, { component: "headline", role: "headline" }, { component: "testimonial_block" }, { component: "cta_button", role: "cta" }] },
];

export interface ProductionContext {
  entityType: string; entityName: string; outputType: string;
  headline: string; subheadline: string; cta: string; conceptAngle: string;
  luxury: number; investment: number; lifestyle: number; urgency: number; seller: number; buyer: number; modern: number;
  dnaColors: string[]; // approved primary colors if any
  propertyType?: string | null; price?: number | null; city?: string | null; neighborhood?: string | null; features?: string[];
  approvedPatterns: string[]; rejectedPatterns: string[];
}

function pickPalettes(c: ProductionContext): Palette[] {
  const out: Palette[] = [];
  if (c.luxury >= 65) { out.push(PALETTES.luxury_green, PALETTES.noir); }
  else if (c.investment >= 60) { out.push(PALETTES.trust_blue, PALETTES.clean_light); }
  else if (c.modern >= 60) { out.push(PALETTES.brand_purple, PALETTES.clean_light); }
  else { out.push(PALETTES.clean_light, PALETTES.brand_purple); }
  // if DNA has approved brand colors, derive a custom palette as first choice
  if (c.dnaColors.length >= 1) {
    const bg = c.dnaColors[0];
    out.unshift({ id: "brand_custom", label: "מותג", bg, bg2: c.dnaColors[1] ?? bg, text: "#FFFFFF", muted: "#E5E5E5", accent: c.dnaColors[2] ?? "#FBBF24", onAccent: bg });
  }
  return out;
}

function layoutsFor(c: ProductionContext): LayoutDef[] {
  const t = c.outputType;
  let pool = LAYOUTS.filter((l) => l.appliesTo.includes(t));
  if (c.entityType === "project") pool = [LAYOUTS.find((l) => l.id === "project_launch")!, ...pool];
  if (c.seller >= 60 && t.includes("seller")) pool = [LAYOUTS.find((l) => l.id === "seller_recruitment")!, ...pool];
  if (c.luxury >= 65) pool = [LAYOUTS.find((l) => l.id === "luxury_property")!, ...pool];
  if (c.investment >= 60) pool = [LAYOUTS.find((l) => l.id === "investment_opportunity")!, ...pool];
  // de-dup, keep order
  const seen = new Set<string>(); const ordered: LayoutDef[] = [];
  for (const l of pool) { if (l && !seen.has(l.id)) { seen.add(l.id); ordered.push(l); } }
  if (!ordered.length) ordered.push(LAYOUTS[0]);
  return ordered;
}

const fmtPrice = (n: number | null | undefined) => (n && n > 0 ? `₪${n.toLocaleString("he-IL")}` : "במחיר מנצח");

function fillBlock(spec: { component: ComponentType; role?: string }, c: ProductionContext): RenderBlock {
  const loc = c.neighborhood || c.city || "";
  switch (spec.role) {
    case "headline": return { component: spec.component, text: c.headline, emphasis: "primary", align: "start" };
    case "subheadline": return { component: spec.component, text: c.subheadline, align: "start" };
    case "cta": return { component: spec.component, text: c.cta, emphasis: "primary", align: "center" };
    case "price": return { component: spec.component, text: fmtPrice(c.price) };
    case "location": return { component: spec.component, text: loc || "מיקום מבוקש" };
    case "type": return { component: spec.component, text: c.conceptAngle || OUTPUT_TYPE_LABELS[c.outputType] || "" };
    default: break;
  }
  switch (spec.component) {
    case "property_features": return { component: spec.component, items: c.features?.length ? c.features.slice(0, 4) : ["חדרים", "מ״ר", "מרפסת", "חניה"] };
    case "agent_card": return { component: spec.component, text: c.entityName };
    case "project_details": return { component: spec.component, items: ["סוגי דירות", "מועד אכלוס", "מפרט"] };
    case "developer_block": return { component: spec.component, text: "יזם מוביל · בנייה אמינה" };
    case "investment_block": return { component: spec.component, items: ["תשואה צפויה", "פוטנציאל צמיחה", "ביקוש באזור"] };
    case "testimonial_block": return { component: spec.component, text: "לקוחות מרוצים ממליצים" };
    case "image_placeholder": return { component: spec.component, text: "תמונת נכס (תתווסף בשלב הוויזואלי)" };
    case "logo_slot": return { component: spec.component, text: c.entityName };
    case "whatsapp_cta": return { component: spec.component, text: c.cta || "דברו איתנו בוואטסאפ", emphasis: "primary", align: "center" };
    default: return { component: spec.component, text: "" };
  }
}

/** Produce 4-8 structured, editable creative variants. */
export function produceCreativeVariants(c: ProductionContext): RenderObject[] {
  const dims = FORMAT_DIMS[c.outputType] ?? FORMAT_DIMS.feed_post;
  const layouts = layoutsFor(c).slice(0, 4);
  const palettes = pickPalettes(c).slice(0, 2);
  const out: RenderObject[] = [];
  for (const layout of layouts) {
    for (const palette of palettes) {
      if (out.length >= 8) break;
      out.push({
        format: c.outputType, width: dims.w, height: dims.h, layoutId: layout.id, layoutLabel: layout.label,
        paletteId: palette.id, palette, blocks: layout.blocks.map((b) => fillBlock(b, c)),
      });
    }
  }
  return out.slice(0, Math.max(4, Math.min(8, out.length)));
}

/** Map a creative asset type → the closest output type. */
export function outputTypeForAsset(assetType: string, entityType: string): string {
  const map: Record<string, string> = {
    feed_post: "feed_post", story: "story", carousel: "carousel", reel_cover: "reel_cover", banner: "banner",
    seller_recruitment_ad: "seller_recruitment_creative", buyer_recruitment_ad: "buyer_recruitment_creative",
    project_awareness_asset: entityType === "project" ? "project_card" : "feed_post", investment_asset: "property_card",
    neighborhood_asset: "feed_post", agent_branding_asset: "feed_post", office_branding_asset: "feed_post",
  };
  return map[assetType] ?? "feed_post";
}
