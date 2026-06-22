// ============================================================================
// ZONO — Brand Identity Service (server-only)
// ----------------------------------------------------------------------------
// The single source of truth for brand identity. getEffectiveBrand() is the
// function ALL generators (websites, portals, posts, WhatsApp, PDFs, etc.)
// consume. Agents inherit the office brand unless override is allowed. RLS.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { computeCompletion, buildAiDesignProfile, resolveEffectiveBrand, type EffectiveBrand } from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
export type BrandRow = Record<string, unknown>;

async function fetchProfile(supabase: DB, entityType: string, entityId: string): Promise<BrandRow | null> {
  const { data } = await supabase.from("brand_identity_profiles").select("*").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  return (data as BrandRow) ?? null;
}

export interface BrandStudio { profile: BrandRow | null; office: BrandRow | null; assets: BrandRow[]; isManager: boolean; entityType: string; entityId: string; effective: EffectiveBrand }

/** Load the brand studio for the current agent (defaults to the logged-in user). */
export async function getBrandStudio(entityType = "agent", entityId?: string): Promise<BrandStudio> {
  const { userId, orgId, isManager, supabase } = await ctx();
  const eid = entityId ?? userId;
  const profile = await fetchProfile(supabase, entityType, eid);
  const office = await fetchProfile(supabase, "office", orgId);
  const { data: assets } = await supabase.from("brand_assets").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", eid).eq("status", "active").order("created_at", { ascending: false }).limit(40);
  const effective = resolveEffectiveBrand(profile, office);
  return { profile, office, assets: (assets ?? []) as BrandRow[], isManager, entityType, entityId: eid, effective };
}

export async function ensureBrandProfile(entityType: string, entityId: string): Promise<{ id: string }> {
  const { orgId, supabase } = await ctx();
  const existing = await fetchProfile(supabase, entityType, entityId);
  if (existing) return { id: existing.id as string };
  const { data, error } = await supabase.from("brand_identity_profiles").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת פרופיל המותג נכשלה");
  return { id: (data as { id: string }).id };
}

const TEXT_KEYS = [
  "full_name", "display_name", "title", "short_bio", "phone", "whatsapp", "email", "office_name", "profile_visibility",
  "profile_image_url", "profile_image_thumb", "profile_image_status", "logo_url", "logo_dark_url", "logo_light_url", "logo_transparent_url", "logo_type", "logo_status",
  "brand_primary", "brand_secondary", "brand_accent", "colors_source", "brand_style", "brand_tone",
  "writing_style", "communication_tone", "brand_personality", "target_audience", "preferred_cta_style", "preferred_design_language", "preferred_post_style",
] as const;

export interface SaveBrandInput extends Record<string, unknown> { entityType: string; entityId: string }
export async function saveBrandProfile(input: SaveBrandInput): Promise<void> {
  const { orgId, supabase } = await ctx();
  await ensureBrandProfile(input.entityType, input.entityId);
  const patch: Record<string, unknown> = {};
  for (const k of TEXT_KEYS) if (input[k] !== undefined) patch[k] = input[k];
  if (input.years_experience !== undefined) patch.years_experience = input.years_experience;
  if (input.inherit_brand_settings !== undefined) patch.inherit_brand_settings = input.inherit_brand_settings;
  if (input.allow_agent_override !== undefined) patch.allow_agent_override = input.allow_agent_override;
  if (input.color_confidence_score !== undefined) patch.color_confidence_score = input.color_confidence_score;
  for (const k of ["service_areas", "specialties", "languages", "brand_palette"]) if (input[k] !== undefined) patch[k] = input[k] as Json;

  // recompute completion + ai design profile from the merged values
  const current = await fetchProfile(supabase, input.entityType, input.entityId);
  const merged = { ...(current ?? {}), ...patch };
  patch.completion_score = computeCompletion(merged as never).score;
  patch.ai_design_profile = buildAiDesignProfile(merged) as unknown as Json;

  await supabase.from("brand_identity_profiles").update(patch as never).eq("org_id", orgId).eq("entity_type", input.entityType).eq("entity_id", input.entityId);
}

export async function saveBrandColors(entityType: string, entityId: string, c: { primary: string; secondary: string; accent: string; palette: string[]; confidence: number; source: string }): Promise<void> {
  const { orgId, supabase } = await ctx();
  await ensureBrandProfile(entityType, entityId);
  await supabase.from("brand_identity_profiles").update({ brand_primary: c.primary, brand_secondary: c.secondary, brand_accent: c.accent, brand_palette: c.palette as unknown as Json, color_confidence_score: c.confidence, colors_source: c.source } as never).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);
  // refresh completion + ai profile
  const cur = await fetchProfile(supabase, entityType, entityId);
  if (cur) await supabase.from("brand_identity_profiles").update({ completion_score: computeCompletion(cur as never).score, ai_design_profile: buildAiDesignProfile(cur) as unknown as Json } as never).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);
}

export async function saveBrandAsset(entityType: string, entityId: string, assetKind: string, url: string, storagePath?: string | null): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("brand_assets").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, asset_kind: assetKind, url, storage_path: storagePath ?? null });
  // mirror office logo / profile image onto the profile for fast generator access
  if (entityType === "office" && assetKind === "office_logo") await saveBrandProfile({ entityType, entityId, logo_url: url, logo_status: "active" });
}

/** THE function every generator consumes: the effective brand for an agent within an org. */
export async function getEffectiveBrand(orgId: string, agentId: string | null): Promise<EffectiveBrand> {
  const supabase = await createClient();
  let agent: BrandRow | null = null; let office: BrandRow | null = null;
  try { if (agentId) { const { data } = await supabase.from("brand_identity_profiles").select("*").eq("entity_type", "agent").eq("entity_id", agentId).maybeSingle(); agent = (data as BrandRow) ?? null; } } catch { /* ignore */ }
  try { const { data } = await supabase.from("brand_identity_profiles").select("*").eq("entity_type", "office").eq("entity_id", orgId).maybeSingle(); office = (data as BrandRow) ?? null; } catch { /* ignore */ }
  return resolveEffectiveBrand(agent, office);
}
