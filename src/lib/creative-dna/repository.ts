// ============================================================================
// ZONO — Creative DNA repository (server-only). REAL org-scoped Supabase queries
// over the creative_dna_* tables. RLS enforces isolation; org_id is stamped on
// writes. The tables aren't in the generated Database type → `as never` casts.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  DIST_DNA,
  type CreativeDnaProfileRow, type CreativeReferenceAssetRow, type CreativeDnaAnalysisRunRow,
  type CreativeDnaStatus, type StyleDNA, type ReferenceStrength,
} from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
export async function dnaScope(): Promise<{ db: DB; orgId: string; userId: string | null } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { db: await createClient(), orgId: profile.org_id, userId: profile.id ?? null };
}
const list = <T>(d: unknown): T[] => (d ?? []) as T[];

export const creativeDnaRepository = {
  // ── Profiles ────────────────────────────────────────────────────────────────
  async listProfiles(): Promise<CreativeDnaProfileRow[]> {
    const s = await dnaScope(); if (!s) return [];
    const { data } = await s.db.from(DIST_DNA.profiles as never).select("*").eq("org_id", s.orgId).order("created_at", { ascending: false });
    return list<CreativeDnaProfileRow>(data);
  },
  async getProfile(id: string): Promise<CreativeDnaProfileRow | null> {
    const s = await dnaScope(); if (!s) return null;
    const { data } = await s.db.from(DIST_DNA.profiles as never).select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
    return (data as unknown as CreativeDnaProfileRow) ?? null;
  },
  async createProfile(input: { name: string; description?: string | null; styleType?: string; agentId?: string | null }): Promise<CreativeDnaProfileRow | null> {
    const s = await dnaScope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST_DNA.profiles as never).insert({
      org_id: s.orgId, name: input.name, description: input.description ?? null,
      style_type: input.styleType ?? "custom", status: "draft", agent_id: input.agentId ?? null,
      office_id: s.orgId, created_by: s.userId,
    } as never).select("*").single();
    if (error) { console.error("[creative-dna] createProfile:", error.message); return null; }
    return data as unknown as CreativeDnaProfileRow;
  },
  async updateProfile(id: string, patch: Partial<{ name: string; description: string | null; status: CreativeDnaStatus }>): Promise<boolean> {
    const s = await dnaScope(); if (!s) return false;
    const { error } = await s.db.from(DIST_DNA.profiles as never).update(patch as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  /** Write an aggregated Style DNA onto the profile + mark ready. */
  async applyStyleDna(id: string, dna: StyleDNA): Promise<boolean> {
    const s = await dnaScope(); if (!s) return false;
    const { error } = await s.db.from(DIST_DNA.profiles as never).update({
      status: "ready", analysis_summary: dna.analysisSummary, style_prompt: dna.stylePrompt, negative_prompt: dna.negativePrompt,
      color_palette: dna.colorPalette, typography_rules: dna.typographyRules, layout_rules: dna.layoutRules,
      hierarchy_rules: dna.hierarchyRules, icon_rules: dna.iconRules, agent_positioning_rules: dna.agentPositioningRules,
      logo_rules: dna.logoRules, image_usage_rules: dna.imageUsageRules,
    } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  async deleteProfile(id: string): Promise<boolean> {
    const s = await dnaScope(); if (!s) return false;
    const { error } = await s.db.from(DIST_DNA.profiles as never).delete().eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  /** Make exactly one profile the org default. */
  async setDefault(id: string): Promise<boolean> {
    const s = await dnaScope(); if (!s) return false;
    await s.db.from(DIST_DNA.profiles as never).update({ is_default: false } as never).eq("org_id", s.orgId);
    const { error } = await s.db.from(DIST_DNA.profiles as never).update({ is_default: true } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  // ── Reference assets ──────────────────────────────────────────────────────────
  async listAssets(profileId: string): Promise<CreativeReferenceAssetRow[]> {
    const s = await dnaScope(); if (!s) return [];
    const { data } = await s.db.from(DIST_DNA.assets as never).select("*").eq("org_id", s.orgId).eq("creative_dna_profile_id", profileId).order("created_at", { ascending: false });
    return list<CreativeReferenceAssetRow>(data);
  },
  async countAssets(profileId: string): Promise<number> {
    const s = await dnaScope(); if (!s) return 0;
    const { count } = await s.db.from(DIST_DNA.assets as never).select("id", { count: "exact", head: true }).eq("org_id", s.orgId).eq("creative_dna_profile_id", profileId);
    return count ?? 0;
  },
  async insertAsset(input: { profileId: string; storagePath: string; fileName: string | null; mimeType: string | null }): Promise<CreativeReferenceAssetRow | null> {
    const s = await dnaScope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST_DNA.assets as never).insert({
      org_id: s.orgId, creative_dna_profile_id: input.profileId, storage_path: input.storagePath,
      file_name: input.fileName, mime_type: input.mimeType, source_type: "upload", analysis_status: "pending",
    } as never).select("*").single();
    if (error) { console.error("[creative-dna] insertAsset:", error.message); return null; }
    return data as unknown as CreativeReferenceAssetRow;
  },
  async updateAssetAnalysis(id: string, patch: { analysisStatus: string; analysisJson?: Record<string, unknown>; dominantColors?: string[]; detectedLayout?: string | null; score?: number | null }): Promise<boolean> {
    const s = await dnaScope(); if (!s) return false;
    const row: Record<string, unknown> = { analysis_status: patch.analysisStatus };
    if (patch.analysisJson !== undefined) row.analysis_json = patch.analysisJson;
    if (patch.dominantColors !== undefined) row.dominant_colors = patch.dominantColors;
    if (patch.detectedLayout !== undefined) row.detected_layout = patch.detectedLayout;
    if (patch.score !== undefined) row.score = patch.score;
    const { error } = await s.db.from(DIST_DNA.assets as never).update(row as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  async getAsset(id: string): Promise<CreativeReferenceAssetRow | null> {
    const s = await dnaScope(); if (!s) return null;
    const { data } = await s.db.from(DIST_DNA.assets as never).select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
    return (data as unknown as CreativeReferenceAssetRow) ?? null;
  },
  async deleteAsset(id: string): Promise<boolean> {
    const s = await dnaScope(); if (!s) return false;
    const { error } = await s.db.from(DIST_DNA.assets as never).delete().eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  // ── Analysis runs ─────────────────────────────────────────────────────────────
  async createRun(profileId: string, assetCount: number): Promise<string | null> {
    const s = await dnaScope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST_DNA.runs as never).insert({
      org_id: s.orgId, creative_dna_profile_id: profileId, status: "running", input_asset_count: assetCount,
    } as never).select("id").single();
    if (error) { console.error("[creative-dna] createRun:", error.message); return null; }
    return (data as { id: string }).id;
  },
  async completeRun(id: string, patch: { status: string; summary?: string | null; stylePrompt?: string | null; outputJson?: Record<string, unknown>; error?: string | null }): Promise<void> {
    const s = await dnaScope(); if (!s) return;
    await s.db.from(DIST_DNA.runs as never).update({
      status: patch.status, output_summary: patch.summary ?? null, output_style_prompt: patch.stylePrompt ?? null,
      output_json: patch.outputJson ?? {}, error_message: patch.error ?? null, completed_at: new Date().toISOString(),
    } as never).eq("id", id).eq("org_id", s.orgId);
  },
  async listRuns(profileId: string): Promise<CreativeDnaAnalysisRunRow[]> {
    const s = await dnaScope(); if (!s) return [];
    const { data } = await s.db.from(DIST_DNA.runs as never).select("*").eq("org_id", s.orgId).eq("creative_dna_profile_id", profileId).order("created_at", { ascending: false }).limit(10);
    return list<CreativeDnaAnalysisRunRow>(data);
  },

  // ── Generation references (applied-DNA log) ───────────────────────────────────
  async logGenerationReference(input: { profileId: string | null; presetKey: string | null; propertyId: string | null; generationId: string | null; strength: ReferenceStrength; appliedPrompt: string; appliedRules: Record<string, unknown> }): Promise<void> {
    const s = await dnaScope(); if (!s) return;
    await s.db.from(DIST_DNA.refs as never).insert({
      org_id: s.orgId, creative_dna_profile_id: input.profileId, preset_key: input.presetKey,
      property_id: input.propertyId, generation_id: input.generationId, reference_strength: input.strength,
      applied_prompt: input.appliedPrompt.slice(0, 4000), applied_rules: input.appliedRules,
    } as never);
  },
};
