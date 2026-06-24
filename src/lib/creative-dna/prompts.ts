// ============================================================================
// ZONO — Creative DNA prompts + DEFAULT presets (client + server safe).
//   • DEFAULT_DNA_PRESETS — 6 product presets (selectable in generation).
//   • buildStyleDnaPromptBlock — the reusable style block appended to the ad
//     prompt. Extracts STYLE PRINCIPLES only; never copies a specific ad/logo.
//   • Vision prompts — per-asset analysis + aggregation into one Style DNA.
// ============================================================================
import type { CreativeDnaLike, StyleDNA } from "./types";

// ── 6 DEFAULT PRESETS (code, selectable; not rows in the user's table) ───────
export interface DnaPreset extends Omit<CreativeDnaLike, "id"> { presetKey: string; description: string }

export const DEFAULT_DNA_PRESETS: DnaPreset[] = [
  {
    presetKey: "zono_premium_editorial", name: "ZONO Premium Editorial",
    description: "ברירת המחדל הפרימיום של ZONO — מגזין אדריכלי, נקי ואדיטוריאלי.",
    styleType: "preset", status: "ready",
    stylePrompt: "Architectural-magazine editorial real-estate campaign. Cinematic hero property photo, generous negative space, confident designed Hebrew typography, refined dividers, a quiet luxury feel. Apple × Architectural Digest restraint.",
    negativePrompt: "no Canva template, no generic real-estate card, no clutter, no cheap stickers, no fake luxury fonts, no overlay-on-photo look.",
    colorPalette: [], layoutRules: { hero: "top 65-80%", panels: "floating glass", grid: "clean editorial" },
    typographyRules: { style: "modern Hebrew editorial", hierarchy: "headline → price → details" },
    hierarchyRules: { order: ["sale_label", "headline", "address", "price", "cta", "agent"] },
    iconRules: { style: "minimal line icons, one consistent family", usage: "secondary" },
    agentPositioningRules: { role: "trusted advisor", prominence: "secondary" },
    logoRules: { treatment: "subtle trust signal, never hero" }, imageUsageRules: { hero: true, collage: "optional" },
  },
  {
    presetKey: "luxury_dark", name: "Luxury Dark Real Estate",
    description: "כהה ויוקרתי — נייבי/שחור עם אקסנט מטאלי, אווירת בוטיק.",
    styleType: "preset", status: "ready",
    stylePrompt: "Dark luxury real-estate campaign: deep navy/black canvas, champagne-gold or brand-accent metallics, dramatic lighting, boutique premium mood, elegant restrained type.",
    negativePrompt: "no bright busy backgrounds, no neon, no cartoon icons, no template card.",
    colorPalette: ["#0B1622", "#062B4A"], layoutRules: { mood: "dark dramatic", contrast: "high" },
    typographyRules: { contrast: "light type on dark", weight: "confident" },
    hierarchyRules: { emphasis: "headline + price glow" }, iconRules: { style: "thin light-line icons" },
    agentPositioningRules: { role: "private consultant" }, logoRules: { treatment: "metallic, understated" },
    imageUsageRules: { lighting: "cinematic, moody" },
  },
  {
    presetKey: "developer_launch", name: "Developer Launch Campaign",
    description: "השקת פרויקט יזמי — גרנדיוזי, גיאומטרי, עם תחושת אירוע.",
    styleType: "preset", status: "ready",
    stylePrompt: "Premium developer project-launch campaign: grand architectural framing, bold geometric structure, sense of a launch event, confident large headline, brand-accent lines.",
    negativePrompt: "no small flyer feel, no crowded spec sheet, no stock-template look.",
    colorPalette: [], layoutRules: { scale: "grand", geometry: "structured blocks" },
    typographyRules: { headline: "large bold", supporting: "restrained" },
    hierarchyRules: { hero: "project render", secondary: "launch line" }, iconRules: { style: "architectural pictograms" },
    agentPositioningRules: { role: "developer rep" }, logoRules: { treatment: "developer + agency lockup" },
    imageUsageRules: { hero: "render/architecture", multiZone: true },
  },
  {
    presetKey: "boutique_brokerage", name: "Boutique Brokerage",
    description: "מתווך בוטיק — אישי, חם, נקי, עם נוכחות סוכן עדינה.",
    styleType: "preset", status: "ready",
    stylePrompt: "Boutique brokerage campaign: warm, personal, clean, tasteful. The property stays hero with an elegant, understated agent presence and a trustworthy premium tone.",
    negativePrompt: "no salesy shouting, no loud CTA, no busy collage.",
    colorPalette: [], layoutRules: { feel: "warm, airy", whitespace: "generous" },
    typographyRules: { tone: "friendly premium" }, hierarchyRules: { warmth: "personal headline" },
    iconRules: { style: "soft minimal" }, agentPositioningRules: { role: "trusted local advisor", prominence: "tasteful" },
    logoRules: { treatment: "boutique mark, integrated" }, imageUsageRules: { hero: true, portrait: "natural" },
  },
  {
    presetKey: "minimal_property_hero", name: "Minimal Property Hero",
    description: "מינימליסטי — תמונת נכס דומיננטית וטקסט מצומצם ומעוצב.",
    styleType: "preset", status: "ready",
    stylePrompt: "Ultra-minimal property-hero ad: one stunning full property photo dominates, a single elegant headline + price, maximum negative space, museum-grade restraint.",
    negativePrompt: "no extra elements, no icon rows, no spec tables, no clutter.",
    colorPalette: [], layoutRules: { hero: "dominant photo", text: "minimal designed" },
    typographyRules: { minimal: true, designed: true }, hierarchyRules: { only: ["headline", "price"] },
    iconRules: { usage: "none or barely-there" }, agentPositioningRules: { prominence: "minimal" },
    logoRules: { treatment: "tiny corner mark" }, imageUsageRules: { hero: "full-bleed cinematic" },
  },
  {
    presetKey: "multi_image_feature", name: "Multi-Image Feature Campaign",
    description: "קמפיין רב-תמונתי — קולאז' אלגנטי שמספר סיפור על הנכס.",
    styleType: "preset", status: "ready",
    stylePrompt: "Elegant multi-image feature campaign: a refined collage / multi-zone magazine layout telling the property's story across 2-4 photos, with a cohesive premium frame and confident type.",
    negativePrompt: "no messy collage, no mismatched crops, no clutter, no template grid.",
    colorPalette: [], layoutRules: { zones: "2-4 image zones", composition: "magazine collage" },
    typographyRules: { cohesion: "single type system across zones" }, hierarchyRules: { lead: "primary hero + supporting" },
    iconRules: { style: "consistent minimal" }, agentPositioningRules: { role: "advisor" },
    logoRules: { treatment: "consistent across zones" }, imageUsageRules: { multiZone: true, story: true },
  },
];

export function presetToDnaLike(p: DnaPreset): CreativeDnaLike {
  return {
    id: null, presetKey: p.presetKey, name: p.name, styleType: "preset", status: p.status,
    stylePrompt: p.stylePrompt, negativePrompt: p.negativePrompt, colorPalette: p.colorPalette,
    layoutRules: p.layoutRules, typographyRules: p.typographyRules, hierarchyRules: p.hierarchyRules,
    iconRules: p.iconRules, agentPositioningRules: p.agentPositioningRules, logoRules: p.logoRules,
    imageUsageRules: p.imageUsageRules,
  };
}
export function getPreset(key: string | null | undefined): DnaPreset | null {
  return DEFAULT_DNA_PRESETS.find((p) => p.presetKey === key) ?? null;
}

const j = (o: Record<string, unknown> | undefined) => { try { const s = JSON.stringify(o ?? {}); return s === "{}" ? "" : s; } catch { return ""; } };

/** The reusable Style-DNA prompt block appended to the ad prompt (spec §6). */
export function buildStyleDnaPromptBlock(dna: CreativeDnaLike): string {
  const lines = [
    `CREATIVE DNA — be INSPIRED by this style, never copy any specific reference ad 1:1, never copy a competitor logo or an exact copyrighted layout. Extract STYLE PRINCIPLES only.`,
    `Creative DNA: ${dna.name}.`,
    dna.stylePrompt ? `Style: ${dna.stylePrompt}` : "",
    dna.colorPalette.length ? `Color principles: ${dna.colorPalette.join(", ")} (subordinate to the supplied brand palette).` : "",
    j(dna.layoutRules) ? `Layout rules: ${j(dna.layoutRules)}` : "",
    j(dna.typographyRules) ? `Typography rules: ${j(dna.typographyRules)}` : "",
    j(dna.hierarchyRules) ? `Hierarchy rules: ${j(dna.hierarchyRules)}` : "",
    j(dna.iconRules) ? `Icon rules: ${j(dna.iconRules)}` : "",
    j(dna.agentPositioningRules) ? `Agent rules: ${j(dna.agentPositioningRules)}` : "",
    j(dna.logoRules) ? `Logo rules: ${j(dna.logoRules)}` : "",
    j(dna.imageUsageRules) ? `Image usage: ${j(dna.imageUsageRules)}` : "",
    `The Creative DNA influences composition, hierarchy, visual language, luxury level, icon treatment, agent/logo placement and overall art direction — but it MUST NOT change the property data, agent name, phone, price, address, the supplied office logo, or the supplied agent photo.`,
    dna.negativePrompt ? `Avoid: ${dna.negativePrompt}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

// ── Vision analysis prompts ───────────────────────────────────────────────────
/** Per-asset Vision prompt — extract style attributes from ONE reference ad. */
export const ASSET_VISION_PROMPT = `You are a senior real-estate creative director. Analyze this advertising image and EXTRACT ITS STYLE (do not transcribe private data, do not copy it). Answer ONLY with JSON:
{"compositionType":"", "imageZones":0, "numberOfPhotos":0, "usesAgentImage":false, "usesLogo":false,
 "priceHierarchy":"", "headlineHierarchy":"", "ctaPlacement":"", "colorPalette":[], "typographyStyle":"",
 "iconStyle":"", "decorativeMotifs":[], "densityLevel":"low|medium|high", "luxuryLevel":"low|medium|high",
 "stoppingPower":0, "weaknesses":[], "whatToAvoid":[], "detectedLayout":"", "dominantColors":[]}
stoppingPower = 0-100 social-feed scroll-stopping power. dominantColors / colorPalette = hex strings.`;

/** Aggregation prompt — combine N per-asset analyses into ONE Style DNA. */
export function buildAggregationPrompt(perAsset: unknown[], profileName: string): string {
  return `You are a senior real-estate brand strategist. Below are style analyses of ${perAsset.length} reference ads an agent LIKES. Synthesize them into ONE coherent, reusable "Style DNA" for "${profileName}". Extract shared STYLE PRINCIPLES — never copy a specific ad or any competitor logo. Answer ONLY with JSON:
{"analysisSummary":"<2-4 Hebrew sentences describing the style>",
 "stylePrompt":"<one rich English art-direction paragraph capturing the style to steer image generation>",
 "negativePrompt":"<short English list of what to avoid>",
 "colorPalette":["#hex", ...],
 "typographyRules":{}, "layoutRules":{}, "hierarchyRules":{}, "iconRules":{},
 "agentPositioningRules":{}, "logoRules":{}, "imageUsageRules":{}}
Per-asset analyses:\n${JSON.stringify(perAsset).slice(0, 12000)}`;
}

/** A deterministic fallback Style DNA when no Vision provider is configured —
 *  built from whatever per-asset signals exist (never fabricated luxury claims). */
export function fallbackStyleDna(perAsset: { dominantColors?: string[]; luxuryLevel?: string; densityLevel?: string }[], profileName: string): StyleDNA {
  const colors = Array.from(new Set(perAsset.flatMap((a) => a.dominantColors ?? []))).slice(0, 6);
  return {
    analysisSummary: `"${profileName}" — סגנון שנלמד מ-${perAsset.length} מודעות שהעלית (ניתוח בסיסי — חבר ספק Vision לניתוח מלא).`,
    stylePrompt: "Premium real-estate campaign in a clean, editorial, magazine-grade style consistent with the uploaded references.",
    negativePrompt: "no clutter, no template card, no cheap stickers, no broken Hebrew.",
    colorPalette: colors,
    typographyRules: { style: "designed editorial" }, layoutRules: { hero: "property-dominant" },
    hierarchyRules: { order: ["sale_label", "headline", "address", "price", "cta", "agent"] },
    iconRules: { style: "minimal line, one family" }, agentPositioningRules: { prominence: "secondary" },
    logoRules: { treatment: "subtle" }, imageUsageRules: { hero: true },
  };
}
