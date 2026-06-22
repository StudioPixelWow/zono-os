// ============================================================================
// ZONO — Creative Asset Service (server-only)
// ----------------------------------------------------------------------------
// Generates structured creative assets for an approved campaign (seeded by the
// campaign's planned assets + Campaign DNA + concept), scores them, persists.
// Approve/reject feed the learning loop. RLS-scoped. No designs/visuals.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { generateAssets as runGenerator } from "./asset-ai";
import { scoreCreativeAsset } from "./asset-scoring";
import type { GeneratorContext, SeedAsset, CampaignDnaLite } from "./asset-generator";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
export type CreativeAssetRow = Record<string, unknown>;

function cdnaFrom(meta: unknown): CampaignDnaLite {
  const d = (meta && typeof meta === "object" ? (meta as { campaign_dna?: Record<string, number> }).campaign_dna : null) ?? {};
  const n = (k: string, def = 50) => (typeof d[k] === "number" ? d[k] : def);
  return { urgency: n("urgency"), trust: n("trust"), luxury: n("luxury"), lifestyle: n("lifestyle"), investment: n("investment"), seller: n("seller"), buyer: n("buyer"), ctaIntensity: n("ctaIntensity") };
}

async function propertyHints(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<{ propertyType?: string | null; neighborhood?: string | null; city?: string | null }> {
  if (entityType !== "property") return {};
  try { const { data } = await supabase.from("properties").select("type,city,neighborhood").eq("org_id", orgId).eq("id", entityId).maybeSingle(); const p = data as { type?: string; city?: string; neighborhood?: string } | null; return { propertyType: p?.type ?? null, city: p?.city ?? null, neighborhood: p?.neighborhood ?? null }; }
  catch { return {}; }
}

export async function listEntityCreativeAssets(entityType: string, entityId: string): Promise<CreativeAssetRow[]> {
  const { orgId, supabase } = await ctx();
  const { data: camps } = await supabase.from("zono_campaigns").select("id").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).neq("status", "deleted").limit(40);
  const ids = ((camps ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return [];
  const { data } = await supabase.from("zono_creative_assets").select("*").eq("org_id", orgId).in("campaign_id", ids).neq("asset_status", "deleted").order("priority", { ascending: true }).limit(300);
  return (data ?? []) as CreativeAssetRow[];
}

export async function generateAssetsForCampaign(campaignId: string): Promise<{ created: number; provider: string }> {
  const { orgId, supabase } = await ctx();
  const { data: camp } = await supabase.from("zono_campaigns").select("*").eq("org_id", orgId).eq("id", campaignId).maybeSingle();
  const c = camp as Record<string, unknown> | null;
  if (!c) throw new Error("הקמפיין לא נמצא");

  const cdna = cdnaFrom(c.generation_metadata);
  const { data: seedRows } = await supabase.from("zono_campaign_assets").select("*").eq("org_id", orgId).eq("campaign_id", campaignId).order("priority", { ascending: true }).limit(40);
  const seeds: SeedAsset[] = ((seedRows ?? []) as Record<string, unknown>[]).map((s) => ({
    asset_type: s.asset_type as string, title: (s.title as string) ?? null, purpose: (s.purpose as string) ?? null,
    recommended_message: (s.recommended_message as string) ?? null, recommended_cta: (s.recommended_cta as string) ?? null,
    audience_variant: (s.audience_variant as string) ?? null, priority: (s.priority as number) ?? 1,
  }));
  const seedIds = ((seedRows ?? []) as { id: string }[]).map((s) => s.id);

  let dnaConfidence = 40;
  try { const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("ai_confidence_score").eq("entity_type", c.entity_type as string).eq("entity_id", c.entity_id as string).maybeSingle(); dnaConfidence = (dna as { ai_confidence_score?: number } | null)?.ai_confidence_score ?? 40; } catch { /* default */ }

  const hints = await propertyHints(supabase, orgId, c.entity_type as string, c.entity_id as string);
  const gctx: GeneratorContext = {
    entityType: c.entity_type as string, entityName: (c.title as string) ?? "ישות", campaignType: c.campaign_type as string, cdna,
    conceptAngle: (c.marketing_angle as string) ?? null, conceptTitle: null, conceptTrigger: null, ...hints, seeds,
  };

  const { assets, provider } = await runGenerator(gctx);

  // replace prior draft assets for this campaign (keep approved/favorite)
  await supabase.from("zono_creative_assets").update({ asset_status: "archived" }).eq("org_id", orgId).eq("campaign_id", campaignId).eq("asset_status", "draft").eq("is_favorite", false).eq("is_approved", false);

  const rows = assets.map((a, i) => {
    const sc = scoreCreativeAsset(a, cdna, dnaConfidence);
    return {
      org_id: orgId, campaign_id: campaignId, campaign_asset_id: seedIds[i] ?? null, asset_type: a.asset_type, title: a.title,
      objective: a.objective, audience: a.audience, marketing_angle: a.marketing_angle, emotional_trigger: a.emotional_trigger,
      visual_hook: a.visual_hook, copy_hook: a.copy_hook, cta_style: a.cta_style, recommended_layout: a.recommended_layout, priority: a.priority, reasoning: a.reasoning,
      campaign_match_score: sc.campaignMatch, audience_match_score: sc.audienceMatch, conversion_potential_score: sc.conversionPotential, marketing_strength_score: sc.marketingStrength, asset_score: sc.overall,
      asset_status: "draft", generation_metadata: { provider } as Json,
    };
  });
  if (rows.length) await supabase.from("zono_creative_assets").insert(rows as never);
  return { created: rows.length, provider };
}

export async function setAssetFavorite(assetId: string, value: boolean): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_creative_assets").update({ is_favorite: value }).eq("org_id", orgId).eq("id", assetId);
}
export async function approveAsset(assetId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_assets").update({ is_approved: true, asset_status: "approved" }).eq("org_id", orgId).eq("id", assetId).select("campaign_id,asset_type").single();
  const row = data as { campaign_id: string; asset_type: string } | null;
  if (row) await writeLearning(supabase, orgId, row.campaign_id, "asset_approved", row.asset_type, userId);
}
export async function rejectAsset(assetId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_assets").update({ is_approved: false, asset_status: "rejected" }).eq("org_id", orgId).eq("id", assetId).select("campaign_id,asset_type").single();
  const row = data as { campaign_id: string; asset_type: string } | null;
  if (row) await writeLearning(supabase, orgId, row.campaign_id, "asset_rejected", row.asset_type, userId);
}
export async function duplicateAsset(assetId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_assets").select("*").eq("org_id", orgId).eq("id", assetId).maybeSingle();
  const a = data as Record<string, unknown> | null;
  if (!a) throw new Error("הנכס לא נמצא");
  await supabase.from("zono_creative_assets").insert({
    org_id: orgId, campaign_id: a.campaign_id, campaign_asset_id: a.campaign_asset_id, asset_type: a.asset_type, title: `${a.title as string} (עותק)`,
    objective: a.objective, audience: a.audience, marketing_angle: a.marketing_angle, emotional_trigger: a.emotional_trigger, visual_hook: a.visual_hook, copy_hook: a.copy_hook,
    cta_style: a.cta_style, recommended_layout: a.recommended_layout, priority: a.priority, reasoning: a.reasoning,
    campaign_match_score: a.campaign_match_score, audience_match_score: a.audience_match_score, conversion_potential_score: a.conversion_potential_score, marketing_strength_score: a.marketing_strength_score, asset_score: a.asset_score,
    asset_status: "draft", generation_metadata: a.generation_metadata as Json,
  } as never);
}
export async function approveAllForCampaign(campaignId: string): Promise<{ approved: number }> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_assets").update({ is_approved: true, asset_status: "approved" }).eq("org_id", orgId).eq("campaign_id", campaignId).neq("asset_status", "deleted").select("id");
  const n = (data as unknown[] | null)?.length ?? 0;
  if (n > 0) await writeLearning(supabase, orgId, campaignId, "asset_approved", "bulk", userId);
  return { approved: n };
}

async function writeLearning(supabase: DB, orgId: string, campaignId: string, feedbackType: string, value: string, userId: string) {
  try {
    const { data: camp } = await supabase.from("zono_campaigns").select("entity_type,entity_id").eq("org_id", orgId).eq("id", campaignId).maybeSingle();
    const c = camp as { entity_type: string; entity_id: string } | null;
    if (c) await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: c.entity_type, entity_id: c.entity_id, feedback_source: "asset", feedback_type: feedbackType, feedback_value: value, created_by: userId });
  } catch { /* learning is best-effort */ }
}
