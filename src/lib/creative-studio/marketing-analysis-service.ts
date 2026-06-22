// ============================================================================
// ZONO — Creative Studio · Marketing DNA Analysis Service (server-only)
// ----------------------------------------------------------------------------
// Runs the real AI analysis: job lifecycle (running→completed/failed), asset
// prioritization + cost-capping, provider call, normalized upsert into
// zono_marketing_dna_profiles PRESERVING manual notes. RLS-scoped to the org.
// No ad/design/campaign generation — DNA analysis only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { DEFAULT_AVOID_RULES, DEFAULT_PREFER_RULES } from "./engine";
import { selectMarketingDnaProvider } from "./providers";
import type { AnalysisAsset, AnalysisInput, MarketingDnaResult } from "./providers/types";

const VISION_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;

type AssetRecord = Record<string, unknown>;
function toAsset(a: AssetRecord): AnalysisAsset {
  return {
    assetType: (a.asset_type as string) ?? "other", category: (a.asset_category as string) ?? null,
    title: (a.title as string) ?? null, description: (a.description as string) ?? null,
    tags: Array.isArray(a.tags) ? (a.tags as string[]) : [], mime: (a.file_mime_type as string) ?? null, url: (a.file_url as string) ?? null,
    isApproved: Boolean(a.is_approved_reference), isRejected: Boolean(a.is_rejected_reference), isCompetitor: Boolean(a.is_competitor_reference),
    isPropertyPhoto: Boolean(a.is_property_photo), isFloorPlan: Boolean(a.is_floor_plan), isProjectRender: Boolean(a.is_project_render), isAgentBrandAsset: Boolean(a.is_agent_brand_asset),
  };
}

/** Prioritize + cap per the cost budget. Visual images go to the model; the rest are metadata-only. */
function prioritize(assets: AnalysisAsset[]): { imageAssets: AnalysisAsset[]; metadataAssets: AnalysisAsset[] } {
  const take = (pool: AnalysisAsset[], pred: (a: AnalysisAsset) => boolean, n: number, used: Set<AnalysisAsset>) => {
    const picked: AnalysisAsset[] = [];
    for (const a of pool) { if (picked.length >= n) break; if (!used.has(a) && pred(a)) { picked.push(a); used.add(a); } }
    return picked;
  };
  const used = new Set<AnalysisAsset>();
  const ordered: AnalysisAsset[] = [
    ...take(assets, (a) => a.isApproved, 5, used),
    ...take(assets, (a) => a.isRejected, 3, used),
    ...take(assets, (a) => a.isPropertyPhoto || a.isProjectRender || a.assetType === "property_photo" || a.assetType === "drone_photo" || a.assetType === "project_render", 4, used),
    ...take(assets, (a) => a.assetType === "logo" || a.isAgentBrandAsset, 2, used),
    ...take(assets, (a) => a.assetType === "brochure" || a.assetType === "website_screenshot", 2, used),
    ...take(assets, (a) => a.isCompetitor || a.assetType === "neighborhood_reference" || a.assetType === "competitor_reference", 2, used),
  ];
  const imageAssets = ordered.filter((a) => a.url && a.mime && VISION_MIME.includes(a.mime));
  const metadataAssets = ordered.filter((a) => !imageAssets.includes(a)); // unsupported files → metadata only
  return { imageAssets, metadataAssets };
}

async function resolveEntityName(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<string> {
  try {
    if (entityType === "agent") { const { data } = await supabase.from("users").select("full_name").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { full_name?: string } | null)?.full_name ?? "סוכן"; }
    if (entityType === "office") { const { data } = await supabase.from("organizations").select("name").eq("id", entityId).maybeSingle(); return (data as { name?: string } | null)?.name ?? "משרד"; }
    if (entityType === "property") { const { data } = await supabase.from("properties").select("title").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { title?: string } | null)?.title ?? "נכס"; }
    if (entityType === "project") { const { data } = await supabase.from("projects").select("name").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { name?: string } | null)?.name ?? "פרויקט"; }
  } catch { /* fall through */ }
  return "ישות";
}

export interface AnalysisRunResult { provider: string; confidence: number; jobId: string }

export async function runMarketingAnalysis(entityType: string, entityId: string): Promise<AnalysisRunResult> {
  const { orgId, supabase } = await ctx();
  const provider = selectMarketingDnaProvider();

  // job → running
  const nowIso = new Date().toISOString();
  const { data: assetRows } = await supabase.from("zono_marketing_assets").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "active").order("created_at", { ascending: false }).limit(200);
  const allAssets = ((assetRows ?? []) as AssetRecord[]).map(toAsset);
  const inputAssetIds = ((assetRows ?? []) as AssetRecord[]).map((a) => a.id as string).slice(0, 100);

  const { data: jobRow } = await supabase.from("zono_marketing_analysis_jobs").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, status: "running", job_type: "marketing_dna_analysis", input_asset_ids: inputAssetIds, started_at: nowIso }).select("id").single();
  const jobId = (jobRow as { id: string } | null)?.id ?? "";

  try {
    const entityName = await resolveEntityName(supabase, orgId, entityType, entityId);
    const { imageAssets, metadataAssets } = prioritize(allAssets);
    const input: AnalysisInput = { entityType, entityName, imageAssets, metadataAssets, defaultAvoidRules: DEFAULT_AVOID_RULES, defaultPreferRules: DEFAULT_PREFER_RULES };

    const result = await provider.analyze(input);
    const profileId = await upsertDnaPreservingNotes(supabase, orgId, entityType, entityId, result, provider.name);

    if (jobId) await supabase.from("zono_marketing_analysis_jobs").update({ status: "completed", finished_at: new Date().toISOString(), result_profile_id: profileId }).eq("org_id", orgId).eq("id", jobId);
    return { provider: provider.name, confidence: result.ai_confidence_score, jobId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "analysis failed";
    if (jobId) await supabase.from("zono_marketing_analysis_jobs").update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", jobId);
    throw new Error(msg);
  }
}

/** Upsert DNA by (entity_type, entity_id) — overwrites AI-derived fields, PRESERVES manual notes. */
async function upsertDnaPreservingNotes(supabase: DB, orgId: string, entityType: string, entityId: string, r: MarketingDnaResult, providerName: string): Promise<string | null> {
  const aiPatch = {
    profile_status: "active",
    dna_summary: r.dna_summary, visual_personality: r.visual_personality, copywriting_tone: r.copywriting_tone, real_estate_positioning: r.real_estate_positioning,
    primary_colors: r.primary_colors as unknown as Json, secondary_colors: r.secondary_colors as unknown as Json, accent_colors: r.accent_colors as unknown as Json, forbidden_colors: r.forbidden_colors as unknown as Json,
    preferred_typography: r.preferred_typography as Json, forbidden_typography: r.forbidden_typography as Json,
    preferred_layouts: r.preferred_layouts as unknown as Json, rejected_layouts: r.rejected_layouts as unknown as Json,
    preferred_visual_styles: r.preferred_visual_styles as unknown as Json, rejected_visual_styles: r.rejected_visual_styles as unknown as Json,
    preferred_image_styles: r.preferred_image_styles as unknown as Json, rejected_image_styles: r.rejected_image_styles as unknown as Json,
    preferred_campaign_angles: r.preferred_campaign_angles as unknown as Json, rejected_campaign_angles: r.rejected_campaign_angles as unknown as Json,
    preferred_cta_styles: r.preferred_cta_styles as unknown as Json, whatsapp_cta_style: r.whatsapp_cta_style as Json, target_audiences: r.target_audiences as unknown as Json,
    property_marketing_style: r.property_marketing_style as Json, project_marketing_style: r.project_marketing_style as Json, agent_marketing_style: r.agent_marketing_style as Json,
    seller_recruitment_style: r.seller_recruitment_style as Json, buyer_recruitment_style: r.buyer_recruitment_style as Json, neighborhood_storytelling_style: r.neighborhood_storytelling_style as Json,
    brand_rules: r.brand_rules as unknown as Json, avoid_rules: r.avoid_rules as unknown as Json, approved_patterns: r.approved_patterns as unknown as Json, rejected_patterns: r.rejected_patterns as unknown as Json,
    luxury_score: r.luxury_score, urgency_score: r.urgency_score, modern_score: r.modern_score, sales_aggressiveness_score: r.sales_aggressiveness_score,
    investment_focus_score: r.investment_focus_score, lifestyle_focus_score: r.lifestyle_focus_score, seller_focus_score: r.seller_focus_score, buyer_focus_score: r.buyer_focus_score,
    visual_density_score: r.visual_density_score, ai_generated_score: r.ai_generated_score, ai_confidence_score: r.ai_confidence_score,
    last_analyzed_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase.from("zono_marketing_dna_profiles").select("id").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  if (existing) {
    // UPDATE only AI fields — manual notes (agent/office/seller/zono) are left untouched.
    await supabase.from("zono_marketing_dna_profiles").update(aiPatch as never).eq("org_id", orgId).eq("id", (existing as { id: string }).id);
    return (existing as { id: string }).id;
  }
  const { data, error } = await supabase.from("zono_marketing_dna_profiles").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, ...aiPatch } as never).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "DNA upsert failed");
  void providerName;
  return (data as { id: string }).id;
}
