// ============================================================================
// ZONO — Creative Studio · AI Marketing DNA · provider types + normalization
// ----------------------------------------------------------------------------
// Server-side only (imported by the analysis service + providers). Defines the
// single normalized result every provider must return, and a strict normalizer
// that clamps scores 0-100 and coerces arrays/objects so a bad model response
// can never corrupt the DB row.
// ============================================================================

export interface AnalysisAsset {
  assetType: string;
  category: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  mime: string | null;
  url: string | null; // public bucket url — never logged
  isApproved: boolean;
  isRejected: boolean;
  isCompetitor: boolean;
  isPropertyPhoto: boolean;
  isFloorPlan: boolean;
  isProjectRender: boolean;
  isAgentBrandAsset: boolean;
}

export interface AnalysisInput {
  entityType: string;
  entityName: string;
  imageAssets: AnalysisAsset[]; // capped, prioritized, visual
  metadataAssets: AnalysisAsset[]; // unsupported/extra — metadata only
  defaultAvoidRules: string[];
  defaultPreferRules: string[];
}

export interface MarketingDnaResult {
  dna_summary: string;
  visual_personality: string;
  copywriting_tone: string;
  real_estate_positioning: string;
  primary_colors: string[];
  secondary_colors: string[];
  accent_colors: string[];
  forbidden_colors: string[];
  preferred_typography: Record<string, unknown>;
  forbidden_typography: Record<string, unknown>;
  preferred_layouts: string[];
  rejected_layouts: string[];
  preferred_visual_styles: string[];
  rejected_visual_styles: string[];
  preferred_image_styles: string[];
  rejected_image_styles: string[];
  preferred_campaign_angles: string[];
  rejected_campaign_angles: string[];
  preferred_cta_styles: string[];
  whatsapp_cta_style: Record<string, unknown>;
  target_audiences: string[];
  property_marketing_style: Record<string, unknown>;
  project_marketing_style: Record<string, unknown>;
  agent_marketing_style: Record<string, unknown>;
  seller_recruitment_style: Record<string, unknown>;
  buyer_recruitment_style: Record<string, unknown>;
  neighborhood_storytelling_style: Record<string, unknown>;
  brand_rules: string[];
  avoid_rules: string[];
  approved_patterns: string[];
  rejected_patterns: string[];
  luxury_score: number;
  urgency_score: number;
  modern_score: number;
  sales_aggressiveness_score: number;
  investment_focus_score: number;
  lifestyle_focus_score: number;
  seller_focus_score: number;
  buyer_focus_score: number;
  visual_density_score: number;
  ai_generated_score: number;
  ai_confidence_score: number;
}

export interface MarketingDnaProvider {
  readonly name: string;
  analyze(input: AnalysisInput): Promise<MarketingDnaResult>;
}

// ── normalization ──────────────────────────────────────────────────────────
const clampScore = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};
const strArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : x == null ? "" : JSON.stringify(x))).map((s) => s.trim()).filter(Boolean).slice(0, 30);
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const SCORE_KEYS = [
  "luxury_score", "urgency_score", "modern_score", "sales_aggressiveness_score", "investment_focus_score",
  "lifestyle_focus_score", "seller_focus_score", "buyer_focus_score", "visual_density_score", "ai_generated_score", "ai_confidence_score",
] as const;
const STR_ARRAY_KEYS = [
  "primary_colors", "secondary_colors", "accent_colors", "forbidden_colors", "preferred_layouts", "rejected_layouts",
  "preferred_visual_styles", "rejected_visual_styles", "preferred_image_styles", "rejected_image_styles",
  "preferred_campaign_angles", "rejected_campaign_angles", "preferred_cta_styles", "target_audiences",
  "brand_rules", "avoid_rules", "approved_patterns", "rejected_patterns",
] as const;
const OBJ_KEYS = [
  "preferred_typography", "forbidden_typography", "whatsapp_cta_style", "property_marketing_style", "project_marketing_style",
  "agent_marketing_style", "seller_recruitment_style", "buyer_recruitment_style", "neighborhood_storytelling_style",
] as const;
const STR_KEYS = ["dna_summary", "visual_personality", "copywriting_tone", "real_estate_positioning"] as const;

/** Coerce any (possibly malformed) provider object into a safe MarketingDnaResult. */
export function normalizeResult(raw: unknown): MarketingDnaResult {
  const r = obj(raw);
  const out = {} as Record<string, unknown>;
  for (const k of STR_KEYS) out[k] = str(r[k]);
  for (const k of STR_ARRAY_KEYS) out[k] = strArray(r[k]);
  for (const k of OBJ_KEYS) out[k] = obj(r[k]);
  for (const k of SCORE_KEYS) out[k] = clampScore(r[k] ?? 50);
  return out as unknown as MarketingDnaResult;
}

/** Best-effort JSON extraction from a model text response (handles code fences). */
export function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}
