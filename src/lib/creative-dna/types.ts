// ============================================================================
// ZONO — Creative DNA types (client + server safe). The creative_dna_* tables
// are not in the generated Supabase Database type → repository casts via
// `as never` and shapes results with the row types here.
// ============================================================================

export type CreativeDnaStatus = "draft" | "analyzing" | "ready" | "error";
export type CreativeDnaStyleType = "custom" | "office" | "agent" | "preset";
export type ReferenceAnalysisStatus = "pending" | "analyzing" | "done" | "error";
export type ReferenceStrength = "subtle" | "medium" | "strong";

export const CREATIVE_REFERENCES_BUCKET = "creative-references";
export const MAX_REFERENCES_PER_PROFILE = 50;
export const MIN_REFERENCES_RECOMMENDED = 10;
export const MIN_REFERENCES_FOR_STABLE = 5;

/** The structured Style DNA aggregated from analyzed reference ads. */
export interface StyleDNA {
  analysisSummary: string;
  stylePrompt: string;
  negativePrompt: string;
  colorPalette: string[];                    // hex / named brand colors
  typographyRules: Record<string, unknown>;
  layoutRules: Record<string, unknown>;
  hierarchyRules: Record<string, unknown>;
  iconRules: Record<string, unknown>;
  agentPositioningRules: Record<string, unknown>;
  logoRules: Record<string, unknown>;
  imageUsageRules: Record<string, unknown>;
}

// ── Table rows ────────────────────────────────────────────────────────────────
export interface CreativeDnaProfileRow {
  id: string; org_id: string; agent_id: string | null; office_id: string | null;
  name: string; description: string | null; style_type: CreativeDnaStyleType; status: CreativeDnaStatus;
  is_default: boolean; analysis_summary: string | null; style_prompt: string | null; negative_prompt: string | null;
  color_palette: string[]; typography_rules: Record<string, unknown>; layout_rules: Record<string, unknown>;
  hierarchy_rules: Record<string, unknown>; icon_rules: Record<string, unknown>;
  agent_positioning_rules: Record<string, unknown>; logo_rules: Record<string, unknown>;
  image_usage_rules: Record<string, unknown>; created_by: string | null; created_at: string; updated_at: string;
}

export interface CreativeReferenceAssetRow {
  id: string; org_id: string; creative_dna_profile_id: string; storage_path: string;
  file_name: string | null; mime_type: string | null; width: number | null; height: number | null;
  source_type: string; source_note: string | null; analysis_status: ReferenceAnalysisStatus;
  analysis_json: Record<string, unknown>; extracted_text: string | null; dominant_colors: string[];
  detected_layout: string | null; score: number | null; created_at: string;
}

export interface CreativeDnaAnalysisRunRow {
  id: string; org_id: string; creative_dna_profile_id: string; status: string; input_asset_count: number;
  output_summary: string | null; output_style_prompt: string | null; output_json: Record<string, unknown>;
  error_message: string | null; created_at: string; completed_at: string | null;
}

export interface CreativeGenerationReferenceRow {
  id: string; org_id: string; creative_dna_profile_id: string | null; property_id: string | null;
  generation_id: string | null; preset_key: string | null; reference_strength: ReferenceStrength;
  applied_prompt: string | null; applied_rules: Record<string, unknown>; created_at: string;
}

/** A DB profile OR a code preset — both can drive generation. */
export interface CreativeDnaLike {
  id: string | null;         // null for code presets
  presetKey: string | null;  // set for code presets
  name: string;
  styleType: CreativeDnaStyleType;
  status: CreativeDnaStatus;
  stylePrompt: string | null;
  negativePrompt: string | null;
  colorPalette: string[];
  layoutRules: Record<string, unknown>;
  typographyRules: Record<string, unknown>;
  hierarchyRules: Record<string, unknown>;
  iconRules: Record<string, unknown>;
  agentPositioningRules: Record<string, unknown>;
  logoRules: Record<string, unknown>;
  imageUsageRules: Record<string, unknown>;
}

export const DIST_DNA = {
  profiles: "creative_dna_profiles",
  assets: "creative_reference_assets",
  runs: "creative_dna_analysis_runs",
  refs: "creative_generation_references",
} as const;

export const ALLOWED_REFERENCE_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
