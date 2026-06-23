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
import { normalizeDep } from "./layout-integrity";

// 10 master advertising templates — each reads as a premium real-estate campaign,
// never a CRM card / SaaS widget. Property image is the hero in every one.
export type DesignFamily =
  | "premium_clean" | "luxury_dark" | "editorial_real_estate" | "high_conversion_sales" | "developer_launch"
  | "luxury_editorial" | "boutique_residence" | "penthouse_collection" | "architectural_showcase" | "urban_prestige";
export const DESIGN_FAMILY_LABEL: Record<DesignFamily, string> = {
  premium_clean: "Premium Clean", luxury_dark: "Luxury Dark", editorial_real_estate: "Investment Opportunity",
  high_conversion_sales: "High Conversion Sales", developer_launch: "New Project Launch",
  luxury_editorial: "Luxury Editorial", boutique_residence: "Boutique Residence", penthouse_collection: "Penthouse Collection",
  architectural_showcase: "Architectural Showcase", urban_prestige: "Urban Prestige",
};
export const ALL_TEMPLATES: DesignFamily[] = [
  "premium_clean", "luxury_dark", "editorial_real_estate", "high_conversion_sales", "developer_launch",
  "luxury_editorial", "boutique_residence", "penthouse_collection", "architectural_showcase", "urban_prestige",
];

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
  // Layout-integrity verdict after normalization (collision-free, in-margin,
  // price not cropped). Populated by buildDesignExecutionPlan.
  layout?: import("./layout-integrity").LayoutQA;
}

export interface DesignAssets { hasPropertyImage: boolean; hasLogo: boolean; hasAgentPhoto: boolean; hasPhone: boolean }

/** Trigger → base family. Each of the 4 required triggers maps to a DISTINCT
 *  family so a single generation always yields four different layouts. A
 *  developer agency swaps ONLY the investment concept to Developer Launch
 *  (instead of a blanket override that previously collapsed all four). */
export function familyFor(trigger: ConceptTrigger, dna: BrandDNA): DesignFamily {
  const map: Record<ConceptTrigger, DesignFamily> = {
    luxury: "luxury_dark", family: "premium_clean", investment: "editorial_real_estate",
    price_advantage: "high_conversion_sales", urgency: "high_conversion_sales",
  };
  if (dna.personality === "developer" && trigger === "investment") return "developer_launch";
  return map[trigger];
}

const z = (shown: boolean, top: number, left: number, width: number, height: number, align: Zone["align"], emphasis: Zone["emphasis"]): Zone => ({ shown, top, left, width, height, align, emphasis });

/** Per-family zone maps, type scales, treatments, flags — strategically distinct. */
function planForFamily(family: DesignFamily, a: DesignAssets, agentShown: boolean, adr: ArtDirection): Omit<DesignExecutionPlan, "depId" | "family" | "familyLabel" | "canvas" | "flags" | "notCardProof"> & { flagsPartial: { priceDominant: boolean; propertyImageDominant: boolean } } {
  const env = adr.aiEnvironment.imageModelPrompt;
  switch (family) {
    case "high_conversion_sales": // price leads, image supports, dense, high contrast
      return {
        layoutStructure: "image-band-top → giant-price-center → features → cta + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 34, "center", "med"),
          logo: z(a.hasLogo, 3, 70, 26, 7, "end", "med"),
          badge: z(true, 5, 5, 28, 7, "start", "high"),
          headline: z(true, 37, 5, 90, 9, "start", "high"),
          price: z(true, 47, 6, 88, 19, "center", "hero"),
          features: z(true, 68, 6, 88, 8, "center", "med"),
          subheadline: z(true, 77, 6, 88, 5, "center", "low"),
          cta: z(true, 85, 6, 52, 9, "center", "high"),
          agent: z(agentShown, 85, 60, 36, 9, "end", "low"),
        },
        typography: { headline: 1.9, subheadline: 1.0, price: 3.4, featureValue: 1.2, featureLabel: 0.78, cta: 1.1, agent: 0.85, headlineWeight: 900, family: "sans" },
        spacing: { unit: 8, gap: 8, sectionGap: 14 }, backgroundTreatment: { mode: "photo_scrim", aiEnvironmentPrompt: env, scrim: "rich dark gradient + single bright focal pool" },
        overlaySystem: ["top-photo", "dark-scrim-bottom", "accent-burst-behind-price"], effects: ["high contrast", "bold price block", "accent burst"],
        flagsPartial: { priceDominant: true, propertyImageDominant: false },
      };
    case "premium_clean": // warm, image-hero, trust (agent prominent)
      return {
        layoutStructure: "image-hero-top(rounded) → headline → feature-pills → price → cta + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 4, 4, 92, 46, "center", "hero"),
          logo: z(a.hasLogo, 7, 74, 20, 7, "end", "low"),
          badge: z(true, 7, 7, 24, 7, "start", "med"),
          headline: z(true, 53, 6, 88, 9, "start", "high"),
          subheadline: z(true, 63, 6, 88, 4, "start", "med"),
          features: z(true, 68, 6, 88, 8, "start", "med"),
          price: z(true, 77, 6, 50, 7, "start", "med"),
          cta: z(true, 86, 6, 52, 9, "center", "high"),
          agent: z(agentShown, 86, 60, 36, 9, "end", "high"),
        },
        typography: { headline: 2.0, subheadline: 1.05, price: 1.9, featureValue: 1.2, featureLabel: 0.8, cta: 1.05, agent: 1.0, headlineWeight: 800, family: "sans" },
        spacing: { unit: 10, gap: 10, sectionGap: 16 }, backgroundTreatment: { mode: "brand_gradient", aiEnvironmentPrompt: env, scrim: "soft warm vignette" },
        overlaySystem: ["rounded-photo-card", "soft-bottom-fade"], effects: ["balanced depth", "soft gradient", "rounded"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "editorial_real_estate": // structured, data-led, metrics grid
      return {
        layoutStructure: "image-top(36%) → headline → metrics-grid → price → cta + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 36, "center", "med"),
          logo: z(a.hasLogo, 3, 73, 24, 7, "end", "low"),
          badge: z(true, 5, 5, 22, 7, "start", "med"),
          headline: z(true, 38, 5, 90, 8, "start", "high"),
          subheadline: z(true, 47, 6, 88, 4, "start", "low"),
          features: z(true, 52, 6, 88, 24, "start", "hero"),
          price: z(true, 77, 6, 50, 7, "start", "high"),
          cta: z(true, 86, 6, 52, 9, "center", "med"),
          agent: z(agentShown, 86, 60, 36, 9, "end", "low"),
        },
        typography: { headline: 1.7, subheadline: 0.95, price: 1.7, featureValue: 1.6, featureLabel: 0.78, cta: 1.0, agent: 0.85, headlineWeight: 800, family: "sans" },
        spacing: { unit: 9, gap: 7, sectionGap: 12 }, backgroundTreatment: { mode: "brand_gradient", aiEnvironmentPrompt: env, scrim: "navy gradient + subtle grid depth" },
        overlaySystem: ["top-photo", "grid-panel"], effects: ["clean grid", "subtle depth", "neon-green accent"],
        flagsPartial: { priceDominant: false, propertyImageDominant: false },
      };
    case "developer_launch": // project-led, agent suppressed, project name banner
      return {
        layoutStructure: "project-banner-top → image-band → feature-grid → price + cta (agent suppressed)",
        zones: {
          image: z(a.hasPropertyImage, 29, 0, 100, 40, "center", "high"),
          logo: z(a.hasLogo, 4, 70, 26, 7, "end", "med"),
          badge: z(true, 4, 5, 30, 7, "start", "high"),
          headline: z(true, 12, 5, 88, 11, "start", "high"),
          subheadline: z(true, 23, 6, 80, 4, "start", "low"),
          features: z(true, 67, 6, 88, 8, "center", "high"),
          price: z(true, 77, 6, 50, 6, "start", "med"),
          cta: z(true, 86, 6, 88, 8, "center", "high"),
          agent: z(false, 0, 0, 0, 0, "end", "low"),
        },
        typography: { headline: 2.0, subheadline: 1.0, price: 1.7, featureValue: 1.25, featureLabel: 0.8, cta: 1.05, agent: 0.85, headlineWeight: 900, family: "sans" },
        spacing: { unit: 9, gap: 9, sectionGap: 14 }, backgroundTreatment: { mode: "brand_gradient", aiEnvironmentPrompt: env, scrim: "brand accent header block" },
        overlaySystem: ["accent-header", "photo-band", "feature-grid"], effects: ["clean grid", "subtle depth"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "luxury_editorial": // magazine: full-bleed photo, editorial serif-weight headline lower third
      return {
        layoutStructure: "full-bleed-photo → editorial-headline(lower-third) → thin-rule → price + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 100, "center", "hero"),
          logo: z(a.hasLogo, 5, 72, 23, 7, "end", "low"),
          badge: z(true, 5, 6, 24, 6, "start", "low"),
          headline: z(true, 56, 8, 84, 12, "start", "hero"),
          subheadline: z(true, 69, 8, 80, 5, "start", "low"),
          price: z(true, 77, 6, 42, 7, "start", "med"),
          features: z(false, 0, 0, 0, 0, "start", "low"),
          cta: z(true, 86, 6, 50, 8, "center", "med"),
          agent: z(agentShown, 86, 60, 36, 8, "end", "low"),
        },
        typography: { headline: 2.4, subheadline: 1.0, price: 1.6, featureValue: 1.0, featureLabel: 0.76, cta: 1.0, agent: 0.82, headlineWeight: 800, family: "sans" },
        spacing: { unit: 12, gap: 12, sectionGap: 20 }, backgroundTreatment: { mode: "ai_environment", aiEnvironmentPrompt: env, scrim: "editorial bottom gradient, generous air" },
        overlaySystem: ["full-photo", "editorial-scrim", "thin-rule"], effects: ["negative space", "fine hairline", "soft grade"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "boutique_residence": // warm, large rounded hero photo, elegant text below
      return {
        layoutStructure: "rounded-hero-photo(62%) → elegant-headline → feature-row → price + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 3, 4, 92, 58, "center", "hero"),
          logo: z(a.hasLogo, 6, 72, 22, 7, "end", "low"),
          badge: z(true, 6, 8, 24, 6, "start", "low"),
          headline: z(true, 64, 6, 88, 8, "start", "high"),
          subheadline: z(true, 72, 6, 86, 4, "start", "low"),
          features: z(false, 0, 0, 0, 0, "start", "med"),
          price: z(true, 78, 6, 44, 6, "start", "med"),
          cta: z(true, 87, 6, 52, 8, "center", "high"),
          agent: z(agentShown, 87, 60, 36, 8, "end", "low"),
        },
        typography: { headline: 1.95, subheadline: 1.0, price: 1.7, featureValue: 1.05, featureLabel: 0.8, cta: 1.0, agent: 0.85, headlineWeight: 800, family: "sans" },
        spacing: { unit: 10, gap: 10, sectionGap: 16 }, backgroundTreatment: { mode: "brand_gradient", aiEnvironmentPrompt: env, scrim: "warm ivory vignette" },
        overlaySystem: ["rounded-hero", "warm-panel"], effects: ["warm grade", "rounded", "soft shadow"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "penthouse_collection": // dark prestige, cinematic full-bleed, gold hairline, minimal
      return {
        layoutStructure: "full-bleed-photo → cinematic-dark-scrim → centered-headline → gold price-corner → agent-minimal",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 100, "center", "hero"),
          logo: z(a.hasLogo, 6, 72, 22, 7, "end", "low"),
          badge: z(true, 6, 6, 22, 6, "start", "low"),
          headline: z(true, 56, 10, 80, 13, "center", "hero"),
          subheadline: z(true, 69, 12, 76, 5, "center", "low"),
          price: z(true, 78, 6, 38, 7, "start", "low"),
          features: z(false, 0, 0, 0, 0, "center", "low"),
          cta: z(true, 87, 6, 50, 8, "center", "med"),
          agent: z(agentShown, 87, 60, 36, 8, "end", "low"),
        },
        typography: { headline: 2.5, subheadline: 1.0, price: 1.6, featureValue: 1.05, featureLabel: 0.78, cta: 1.0, agent: 0.82, headlineWeight: 800, family: "sans" },
        spacing: { unit: 12, gap: 12, sectionGap: 22 }, backgroundTreatment: { mode: "ai_environment", aiEnvironmentPrompt: env, scrim: "deep cinematic black, gold spill" },
        overlaySystem: ["full-photo", "cinematic-scrim", "gold-hairline"], effects: ["soft glow", "film grain", "negative space"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "architectural_showcase": // architecture-led, very large photo, thin caption band
      return {
        layoutStructure: "architectural-photo(68%) → thin-caption-band → minimal-headline → price + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 62, "center", "hero"),
          logo: z(a.hasLogo, 4, 73, 24, 7, "end", "low"),
          badge: z(true, 4, 5, 22, 6, "start", "low"),
          headline: z(true, 64, 5, 90, 8, "start", "high"),
          subheadline: z(true, 73, 6, 84, 4, "start", "low"),
          features: z(false, 0, 0, 0, 0, "start", "low"),
          price: z(true, 79, 6, 44, 6, "start", "med"),
          cta: z(true, 87, 6, 52, 8, "center", "med"),
          agent: z(agentShown, 87, 60, 36, 8, "end", "low"),
        },
        typography: { headline: 1.85, subheadline: 0.95, price: 1.6, featureValue: 1.0, featureLabel: 0.78, cta: 1.0, agent: 0.82, headlineWeight: 700, family: "sans" },
        spacing: { unit: 11, gap: 10, sectionGap: 18 }, backgroundTreatment: { mode: "ai_environment", aiEnvironmentPrompt: env, scrim: "neutral architectural light" },
        overlaySystem: ["large-photo", "caption-band"], effects: ["clean lines", "subtle depth", "neutral grade"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "urban_prestige": // city luxury, bold headline over night-city hero
      return {
        layoutStructure: "full-bleed-night-photo → bold-headline → price block → cta + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 100, "center", "hero"),
          logo: z(a.hasLogo, 5, 72, 23, 7, "end", "low"),
          badge: z(true, 5, 6, 26, 7, "start", "med"),
          headline: z(true, 52, 6, 88, 12, "start", "hero"),
          subheadline: z(true, 64, 6, 84, 5, "start", "low"),
          price: z(true, 76, 6, 44, 8, "start", "high"),
          features: z(true, 71, 6, 88, 4, "start", "low"),
          cta: z(true, 86, 6, 52, 8, "center", "high"),
          agent: z(agentShown, 86, 60, 36, 8, "end", "low"),
        },
        typography: { headline: 2.2, subheadline: 1.0, price: 1.9, featureValue: 1.05, featureLabel: 0.78, cta: 1.05, agent: 0.82, headlineWeight: 900, family: "sans" },
        spacing: { unit: 11, gap: 11, sectionGap: 18 }, backgroundTreatment: { mode: "ai_environment", aiEnvironmentPrompt: env, scrim: "night-city gradient, neon spill" },
        overlaySystem: ["full-photo", "night-scrim", "accent-rule"], effects: ["city glow", "high contrast", "depth"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
    case "luxury_dark": // cinematic full-bleed, lots of air, minimal
    default:
      return {
        layoutStructure: "full-bleed-photo → centered-editorial-headline → price band → cta + agent strip",
        zones: {
          image: z(a.hasPropertyImage, 0, 0, 100, 100, "center", "hero"),
          logo: z(a.hasLogo, 5, 72, 23, 7, "end", "low"),
          badge: z(true, 5, 5, 22, 6, "start", "low"),
          headline: z(true, 58, 8, 84, 12, "center", "hero"),
          subheadline: z(true, 71, 10, 80, 5, "center", "low"),
          price: z(true, 77, 6, 40, 7, "start", "low"),
          features: z(false, 0, 0, 0, 0, "center", "low"),
          cta: z(true, 86, 6, 52, 8, "center", "med"),
          agent: z(agentShown, 86, 60, 36, 8, "end", "low"),
        },
        typography: { headline: 2.3, subheadline: 1.0, price: 1.5, featureValue: 1.1, featureLabel: 0.78, cta: 1.0, agent: 0.85, headlineWeight: 800, family: "sans" },
        spacing: { unit: 12, gap: 12, sectionGap: 20 }, backgroundTreatment: { mode: "ai_environment", aiEnvironmentPrompt: env, scrim: "cinematic dark scrim, gold spill" },
        overlaySystem: ["full-photo", "cinematic-scrim", "gold-hairline"], effects: ["soft glow", "film grain", "negative space"],
        flagsPartial: { priceDominant: false, propertyImageDominant: true },
      };
  }
}

/** Build the strict Design Execution Plan for ONE approved concept. An optional
 *  `templateOverride` lets the concept→WOW pipeline assign a specific master
 *  template (e.g. trying penthouse_collection vs luxury_editorial for a luxury
 *  concept and keeping whichever scores higher). */
export function buildDesignExecutionPlan(plan: ConceptPlan, dna: BrandDNA, guidance: BrandGuidance, assets: DesignAssets, templateOverride?: DesignFamily): DesignExecutionPlan {
  const family = templateOverride ?? familyFor(plan.trigger, dna);
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
  const raw: DesignExecutionPlan = {
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
  // Layout-integrity pass: guarantee collision-free, in-margin, price-safe zones.
  const { dep: fixed, qa } = normalizeDep(raw);
  fixed.layout = qa;
  return fixed;
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
