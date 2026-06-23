// ============================================================================
// ZONO — DesignSystemEngine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Translates  approvedConcept + ArtDirection + BrandDNA + available real assets
// into a STRICT Design Execution Plan (DEP) — structured JSON the Renderer will
// execute verbatim. NOT generic templates: each concept gets a different family,
// zone map, type scale, treatment and flags, chosen strategically.
//
// Hard boundaries: does NOT render, does NOT generate images, and does NOT change
// CreativeBrief / Concept / ArtDirection / BrandDNA logic. The Renderer must only
// EXECUTE this plan — it may not invent layout, concept, copy or hierarchy.
// ============================================================================
import type { ConceptTrigger, ConceptPlan, ArtDirection } from "./final-creative-engine";
import type { BrandDNA, BrandGuidance } from "./brand-dna-engine";

export type DesignFamily = "premium_clean" | "luxury_dark" | "editorial_real_estate" | "high_conversion_sales" | "developer_launch";
export const DESIGN_FAMILY_LABEL: Record<DesignFamily, string> = {
  premium_clean: "Premium Clean", luxury_dark: "Luxury Dark", editorial_real_estate: "Editorial Real Estate",
  high_conversion_sales: "High Conversion Sales", developer_launch: "Developer Launch",
};

/** A rectangle in canvas percentages + how it should read. */
export interface Zone { shown: boolean; top: number; left: number; width: number; height: number; align: "start" | "center" | "end"; emphasis: "low" | "med" | "high" | "hero" }
export interface TypeScale { headline: number; subheadline: number; price: number; featureValue: number; featureLabel: number; cta: number; agent: number; headlineWeight: number; family: "sans" }

export interface DesignExecutionPlan {
  depId: string;
  family: DesignFamily; familyLabel: string;
  canvas: { width: number; height: number; safeMargin: number };
  layoutStructure: string;
  zones: { image: Zone; logo: Zone; agent: Zone; headline: Zone; subheadline: Zone; price: Zone; cta: Zone; features: Zone; badge: Zone };
  typography: TypeScale;
  spacing: { unit: number; gap: number; sectionGap: number };
  backgroundTreatment: { mode: "ai_environment" | "brand_gradient" | "photo_scrim"; aiEnvironmentPrompt: string | null; scrim: string };
  overlaySystem: string[];
  effects: string[];
  flags: { agentShown: boolean; agentPhotoShown: boolean; priceDominant: boolean; propertyImageDominant: boolean; logoShown: boolean };
  notCardProof: { isDashboardCard: false; reasons: string[] };
}

export interface DesignAssets { hasPropertyImage: boolean; hasLogo: boolean; hasAgentPhoto: boolean; hasPhone: boolean }

/** Trigger → base family. BrandDNA can override (developer agency → Developer Launch). */
function familyFor(trigger: ConceptTrigger, dna: BrandDNA): DesignFamily {
  if (dna.personality === "developer") return "developer_launch";
  const map: Record<ConceptTrigger, DesignFamily> = {
    luxury: "luxury_dark", family: "premium_clean", investment: "editorial_real_estate",
    price_advantage: "high_conversion_sales", urgency: "high_conversion_sales",
  };
  return map[trigger];
}

const z = (shown: boolean, top: number, left: number, width: number, height: number, align: Zone["align"], emphasis: Zone["emphasis"]): Zone => ({ shown, top, left, width, height, align, emphasis });

/** Per-family zone maps, type scales, treatments, flags — strategically distinct. */
function planForFamily(family: DesignFamily, a: DesignAssets, agentShown: boolean, adr: ArtDirection): Omit<DesignExecutionPlan, "depId" | "family" | "familyLabel" | "canvas" | "flags" | "notCardProof"> & { flagsPartial: { priceDominant: boolean; propertyImageDominant: boolean } } {
  const env = adr.aiEnvironment.imageModelPrompt;
  switch (family) {
    case "high_conversion_sales": // price leads, image supports, dense, high contrast
      return {
        layoutStructure: "image-band-top → giant-price-center → cta-bottom → agent-compact",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 38, "center", "med"),
          logo: z(a.hasLogo, 3, 70, 27, 9, "end", "med"),
          badge: z(true, 4, 4, 28, 8, "start", "high"),
          headline: z(true, 27, 5, 90, 10, "start", "high"),
          price: z(true, 40, 6, 88, 26, "center", "hero"),
          features: z(true, 67, 6, 88, 9, "center", "med"),
          subheadline: z(true, 78, 6, 88, 6, "center", "low"),
          cta: z(true, 86, 6, 60, 9, "center", "high"),
          agent: z(agentShown, 86, 68, 28, 12, "end", "low"),
        },
        typography: { headline: 1.9, subheadline: 1.0, price: 3.4, featureValue: 1.2, featureLabel: 0.78, cta: 1.1, agent: 0.85, headlineWeight: 900, family: "sans" },
        spacing: { unit: 8, gap: 8, sectionGap: 14 }, backgroundTreatment: { mode: "photo_scrim", aiEnvironmentPrompt: env, scrim: "rich dark gradient + single bright focal pool" },
        overlaySystem: ["top-photo", "dark-scrim-bottom", "accent-burst-behind-price"], effects: ["high contrast", "bold price block", "accent burst"],
        flagsPartial: { priceDominant: true, propertyImageDominant: false },
      };
    case "premium_clean": // warm, image-hero, trust (agent prominent)
      return {
        layoutStructure: "image-hero-top(rounded) → headline → feature-pills → price → agent-prominent + cta",
        zones: {
          image: z(a.hasPropertyImage, 4, 4, 92, 52, "center", "hero"),
          logo: z(a.hasLogo, 8, 74, 20, 8, "end", "low"),
          badge: z(true, 8, 8, 24, 8, "start", "med"),
          headline: z(true, 60, 6, 88, 9, "start", "high"),
          subheadline: z(true, 70, 6, 88, 5, "start", "med"),
          features: z(true, 76, 6, 88, 9, "start", "med"),
          price: z(true, 86, 6, 40, 8, "start", "med"),
          agent: z(agentShown, 88, 6, 50, 10, "start", "high"),
          cta: z(true, 88, 60, 34, 9, "center", "high"),
        },
        typography: { headline: 2.0, subheadline: 1.05, price: 1.9, featureValue: 1.2, featureLabel: 0.8, cta: 1.05, agent: 1.0, headlineWeight: 800, family: "sans" },
        spacing: { unit: 10, gap: 10, sectionGap: 16 }, backgroundTreatment: { mode: "brand_gradient", aiEnvironmentPrompt: env, scrim: "soft warm vignette" },
        overlaySystem: ["rounded-photo-card", "soft-bottom-fade"], effects: ["balanced depth", "soft gradient", "rounded"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "editorial_real_estate": // structured, data-led, metrics grid
      return {
        layoutStructure: "image-top(40%) → headline-overlay → metrics-grid(2x2) → cta + agent-compact",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 40, "center", "med"),
          logo: z(a.hasLogo, 3, 73, 24, 8, "end", "low"),
          badge: z(true, 3, 4, 22, 7, "start", "med"),
          headline: z(true, 30, 5, 90, 9, "start", "high"),
          subheadline: z(true, 42, 6, 88, 5, "start", "low"),
          features: z(true, 50, 6, 88, 30, "start", "hero"),
          price: z(true, 50, 6, 42, 14, "start", "high"),
          cta: z(true, 87, 6, 50, 9, "center", "med"),
          agent: z(agentShown, 87, 64, 30, 11, "end", "low"),
        },
        typography: { headline: 1.7, subheadline: 0.95, price: 1.7, featureValue: 1.6, featureLabel: 0.78, cta: 1.0, agent: 0.85, headlineWeight: 800, family: "sans" },
        spacing: { unit: 9, gap: 7, sectionGap: 12 }, backgroundTreatment: { mode: "brand_gradient", aiEnvironmentPrompt: env, scrim: "navy gradient + subtle grid depth" },
        overlaySystem: ["top-photo", "grid-panel"], effects: ["clean grid", "subtle depth", "neon-green accent"],
        flagsPartial: { priceDominant: false, propertyImageDominant: false },
      };
    case "developer_launch": // project-led, agent suppressed, project name banner
      return {
        layoutStructure: "project-banner-top → image-band → feature-grid → cta (agent suppressed)",
        zones: {
          image: z(a.hasPropertyImage, 22, 0, 100, 46, "center", "high"),
          logo: z(a.hasLogo, 3, 70, 27, 9, "end", "med"),
          badge: z(true, 4, 5, 30, 9, "start", "high"),
          headline: z(true, 5, 5, 90, 13, "start", "high"),
          subheadline: z(true, 16, 6, 88, 5, "start", "low"),
          features: z(true, 70, 6, 88, 14, "center", "high"),
          price: z(true, 86, 6, 44, 9, "start", "med"),
          cta: z(true, 86, 60, 34, 9, "center", "high"),
          agent: z(false, 0, 0, 0, 0, "end", "low"),
        },
        typography: { headline: 2.0, subheadline: 1.0, price: 1.7, featureValue: 1.25, featureLabel: 0.8, cta: 1.05, agent: 0.85, headlineWeight: 900, family: "sans" },
        spacing: { unit: 9, gap: 9, sectionGap: 14 }, backgroundTreatment: { mode: "brand_gradient", aiEnvironmentPrompt: env, scrim: "brand accent header block" },
        overlaySystem: ["accent-header", "photo-band", "feature-grid"], effects: ["clean grid", "subtle depth"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "luxury_dark": // cinematic full-bleed, lots of air, minimal
    default:
      return {
        layoutStructure: "full-bleed-photo → centered-editorial-headline → price-corner(small) → agent-minimal",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 100, "center", "hero"),
          logo: z(a.hasLogo, 5, 72, 23, 8, "end", "low"),
          badge: z(true, 5, 5, 22, 7, "start", "low"),
          headline: z(true, 30, 10, 80, 14, "center", "hero"),
          subheadline: z(true, 46, 12, 76, 6, "center", "low"),
          price: z(true, 78, 6, 32, 8, "start", "low"),
          features: z(false, 0, 0, 0, 0, "center", "low"),
          cta: z(true, 88, 60, 34, 9, "center", "med"),
          agent: z(agentShown, 88, 6, 48, 10, "start", "low"),
        },
        typography: { headline: 2.3, subheadline: 1.0, price: 1.5, featureValue: 1.1, featureLabel: 0.78, cta: 1.0, agent: 0.85, headlineWeight: 800, family: "sans" },
        spacing: { unit: 12, gap: 12, sectionGap: 20 }, backgroundTreatment: { mode: "ai_environment", aiEnvironmentPrompt: env, scrim: "cinematic dark scrim, gold spill" },
        overlaySystem: ["full-photo", "cinematic-scrim", "gold-hairline"], effects: ["soft glow", "film grain", "negative space"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
  }
}

/** Build the strict Design Execution Plan for ONE approved concept. */
export function buildDesignExecutionPlan(plan: ConceptPlan, dna: BrandDNA, guidance: BrandGuidance, assets: DesignAssets): DesignExecutionPlan {
  const family = familyFor(plan.trigger, dna);
  const adr = plan.artDirection;
  const agentShown = guidance.showAgentImage && family !== "developer_launch";
  const p = planForFamily(family, assets, agentShown, adr);
  const reasons = [
    `composition '${family}' is a full-canvas advertising layout, not a UI card`,
    p.flagsPartial.propertyImageDominant ? "real property photo is dominant (hero), not a thumbnail in a card" : "price/data leads with a strong ad hierarchy, not a card row",
    "editorial type scale with strong headline→price→CTA hierarchy",
    "no rounded white container, no list rows, no dashboard chrome",
    `${p.overlaySystem.length} overlay layers + effects [${p.effects.join(", ")}] create depth`,
  ];
  return {
    depId: `dep_${plan.trigger}_${family}`,
    family, familyLabel: DESIGN_FAMILY_LABEL[family],
    canvas: { width: 1080, height: 1080, safeMargin: 48 },
    layoutStructure: p.layoutStructure, zones: p.zones, typography: p.typography, spacing: p.spacing,
    backgroundTreatment: p.backgroundTreatment, overlaySystem: p.overlaySystem, effects: p.effects,
    flags: {
      agentShown, agentPhotoShown: agentShown && assets.hasAgentPhoto,
      priceDominant: p.flagsPartial.priceDominant, propertyImageDominant: p.flagsPartial.propertyImageDominant, logoShown: assets.hasLogo,
    },
    notCardProof: { isDashboardCard: false, reasons },
  };
}

export interface DesignReviewGate { approved: boolean; distinctFamilies: number; totalPlans: number; anyDashboardCard: boolean; issues: string[] }

/** Review gate BEFORE the renderer: proves the plans are strategically distinct
 *  and none reads like a dashboard card. */
export function designReviewGate(plans: DesignExecutionPlan[]): DesignReviewGate {
  const families = new Set(plans.map((p) => p.family));
  const issues: string[] = [];
  // Distinctness: families differ OR price/image dominance flags differ.
  const signatures = new Set(plans.map((p) => `${p.family}|${p.flags.priceDominant}|${p.flags.propertyImageDominant}|${p.flags.agentShown}`));
  if (signatures.size < plans.length) issues.push("שני קונספטים חולקים אותה חתימת עיצוב — נדרש בידול");
  const anyCard = plans.some((p) => p.notCardProof.isDashboardCard as boolean);
  if (anyCard) issues.push("תוכנית עיצוב נראית ככרטיס דשבורד");
  return { approved: issues.length === 0, distinctFamilies: families.size, totalPlans: plans.length, anyDashboardCard: anyCard, issues };
}
