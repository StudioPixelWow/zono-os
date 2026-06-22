// ============================================================================
// ZONO — Property Campaign Factory · Service (server-only)
// ----------------------------------------------------------------------------
// Generates + manages complete campaign structures per entity. Reads Marketing
// DNA + top concept + entity hints, derives Campaign DNA, plans assets (AI or
// engine), persists campaign + assets. Approve feeds the learning loop. RLS.
// No designs/visuals — planning only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import {
  deriveCampaignDNA, campaignTitle, campaignReasoning, campaignTypesFor, scoresFromDna,
  CAMPAIGN_TYPE_LABELS, type EntityType, type PlanContext,
} from "./campaign-engine";
import { planCampaign as planViaAI } from "./campaign-ai";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
export type CampaignRow = Record<string, unknown>;
export type CampaignAssetRow = Record<string, unknown>;

async function resolveName(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<string> {
  try {
    if (entityType === "agent") { const { data } = await supabase.from("users").select("full_name").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { full_name?: string } | null)?.full_name ?? "סוכן"; }
    if (entityType === "office") { const { data } = await supabase.from("organizations").select("name").eq("id", entityId).maybeSingle(); return (data as { name?: string } | null)?.name ?? "משרד"; }
    if (entityType === "property") { const { data } = await supabase.from("properties").select("title").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { title?: string } | null)?.title ?? "נכס"; }
    if (entityType === "project") { const { data } = await supabase.from("projects").select("name").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { name?: string } | null)?.name ?? "פרויקט"; }
  } catch { /* fall through */ }
  return "ישות";
}
async function propertyHints(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<{ propertyType?: string | null; neighborhood?: string | null; city?: string | null }> {
  if (entityType !== "property") return {};
  try { const { data } = await supabase.from("properties").select("type,city,neighborhood").eq("org_id", orgId).eq("id", entityId).maybeSingle(); const p = data as { type?: string; city?: string; neighborhood?: string } | null; return { propertyType: p?.type ?? null, city: p?.city ?? null, neighborhood: p?.neighborhood ?? null }; }
  catch { return {}; }
}

export interface CampaignListItem extends Record<string, unknown> {
  id: string; title: string; campaign_type: string; status: string; updated_at: string; assetCount: number; completion: number;
}
export async function listCampaigns(entityType: string, entityId: string): Promise<CampaignListItem[]> {
  const { orgId, supabase } = await ctx();
  const { data: camps } = await supabase.from("zono_campaigns").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).neq("status", "deleted").order("created_at", { ascending: false }).limit(40);
  const rows = (camps ?? []) as CampaignRow[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const { data: assets } = await supabase.from("zono_campaign_assets").select("campaign_id,status").eq("org_id", orgId).in("campaign_id", ids);
  const byCamp = new Map<string, { total: number; done: number }>();
  for (const a of (assets ?? []) as { campaign_id: string; status: string }[]) {
    const cur = byCamp.get(a.campaign_id) ?? { total: 0, done: 0 };
    cur.total++; if (a.status === "approved" || a.status === "produced") cur.done++;
    byCamp.set(a.campaign_id, cur);
  }
  return rows.map((r) => {
    const cc = byCamp.get(r.id as string) ?? { total: 0, done: 0 };
    return { ...r, id: r.id as string, title: r.title as string, campaign_type: r.campaign_type as string, status: r.status as string, updated_at: r.updated_at as string, assetCount: cc.total, completion: cc.total ? Math.round((cc.done / cc.total) * 100) : 0 };
  });
}

/** All planned assets for an entity's non-deleted campaigns (for the drawer). */
export async function listEntityCampaignAssets(entityType: string, entityId: string): Promise<CampaignAssetRow[]> {
  const { orgId, supabase } = await ctx();
  const { data: camps } = await supabase.from("zono_campaigns").select("id").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).neq("status", "deleted").limit(40);
  const ids = ((camps ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return [];
  const { data } = await supabase.from("zono_campaign_assets").select("*").eq("org_id", orgId).in("campaign_id", ids).order("priority", { ascending: true }).limit(400);
  return (data ?? []) as CampaignAssetRow[];
}

export async function getCampaignAssets(campaignId: string): Promise<CampaignAssetRow[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_campaign_assets").select("*").eq("org_id", orgId).eq("campaign_id", campaignId).order("priority", { ascending: true }).limit(60);
  return (data ?? []) as CampaignAssetRow[];
}

export async function generateCampaign(entityType: string, entityId: string, campaignType?: string): Promise<{ campaignId: string; assets: number; provider: string }> {
  const { orgId, userId, supabase } = await ctx();
  const et = entityType as EntityType;
  const type = campaignType || campaignTypesFor(entityType)[0];

  const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("*").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  const dnaRow = (dna as Record<string, unknown>) ?? null;
  const { data: concept } = await supabase.from("zono_creative_concepts").select("id,title,marketing_angle").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "active").order("is_approved", { ascending: false }).order("confidence_score", { ascending: false }).limit(1).maybeSingle();
  const conceptRow = concept as { id: string; title: string; marketing_angle: string } | null;

  const name = await resolveName(supabase, orgId, entityType, entityId);
  const hints = await propertyHints(supabase, orgId, entityType, entityId);
  const scores = scoresFromDna(dnaRow);
  const cdna = deriveCampaignDNA(scores, type);
  const priceTier = scores.luxury >= 75 ? "luxury" : scores.luxury >= 55 ? "premium" : scores.luxury >= 35 ? "mid-market" : "affordable";
  const planCtx: PlanContext = { entityType: et, entityName: name, campaignType: type, dna: scores, cdna, conceptTitle: conceptRow?.title ?? null, conceptAngle: conceptRow?.marketing_angle ?? null, ...hints, priceTier };

  const { assets, provider } = await planViaAI(planCtx);
  const reasoning = campaignReasoning(planCtx, assets.length);

  const { data: campRow, error } = await supabase.from("zono_campaigns").insert({
    org_id: orgId, entity_type: entityType, entity_id: entityId, title: campaignTitle(name, type), campaign_type: type,
    objective: `${CAMPAIGN_TYPE_LABELS[type] ?? type} עבור ${name}`, target_audience: assets.find((a) => a.audience_variant)?.audience_variant ?? null,
    marketing_angle: conceptRow?.marketing_angle ?? null, campaign_summary: `${assets.length} נכסים שיווקיים · תדירות ${cdna.postingFrequency}`,
    reasoning, status: "draft", marketing_dna_profile_id: (dnaRow?.id as string) ?? null, source_concept_id: conceptRow?.id ?? null,
    generation_metadata: { provider, campaign_dna: cdna } as unknown as Json, created_by: userId,
  }).select("id").single();
  if (error || !campRow) throw new Error(error?.message ?? "יצירת הקמפיין נכשלה");
  const campaignId = (campRow as { id: string }).id;

  if (assets.length) await supabase.from("zono_campaign_assets").insert(assets.map((a) => ({
    org_id: orgId, campaign_id: campaignId, asset_type: a.asset_type, title: a.title, purpose: a.purpose,
    recommended_message: a.recommended_message, recommended_cta: a.recommended_cta, audience_variant: a.audience_variant, priority: a.priority, status: "planned",
  })));
  return { campaignId, assets: assets.length, provider };
}

export async function duplicateCampaign(campaignId: string): Promise<{ campaignId: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { data: orig } = await supabase.from("zono_campaigns").select("*").eq("org_id", orgId).eq("id", campaignId).maybeSingle();
  const o = orig as Record<string, unknown> | null;
  if (!o) throw new Error("הקמפיין לא נמצא");
  const { data: newC, error } = await supabase.from("zono_campaigns").insert({
    org_id: orgId, entity_type: o.entity_type, entity_id: o.entity_id, title: `${o.title as string} (עותק)`, campaign_type: o.campaign_type,
    objective: o.objective, target_audience: o.target_audience, marketing_angle: o.marketing_angle, campaign_summary: o.campaign_summary, reasoning: o.reasoning,
    status: "draft", marketing_dna_profile_id: o.marketing_dna_profile_id, source_concept_id: o.source_concept_id, generation_metadata: o.generation_metadata as Json, created_by: userId,
  } as never).select("id").single();
  if (error || !newC) throw new Error(error?.message ?? "השכפול נכשל");
  const newId = (newC as { id: string }).id;
  const { data: assets } = await supabase.from("zono_campaign_assets").select("*").eq("org_id", orgId).eq("campaign_id", campaignId);
  const rows = ((assets ?? []) as Record<string, unknown>[]).map((a) => ({ org_id: orgId, campaign_id: newId, asset_type: a.asset_type as string, title: a.title as string, purpose: a.purpose as string, recommended_message: a.recommended_message as string, recommended_cta: a.recommended_cta as string, audience_variant: a.audience_variant as string, priority: a.priority as number, status: "planned" }));
  if (rows.length) await supabase.from("zono_campaign_assets").insert(rows as never);
  return { campaignId: newId };
}

export async function setCampaignStatus(campaignId: string, status: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_campaigns").update({ status }).eq("org_id", orgId).eq("id", campaignId);
}

export async function approveCampaign(campaignId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_campaigns").update({ status: "approved" }).eq("org_id", orgId).eq("id", campaignId).select("entity_type,entity_id,campaign_type").single();
  const row = data as { entity_type: string; entity_id: string; campaign_type: string } | null;
  // learning loop → feeds Marketing DNA / concepts / future campaigns
  if (row) await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: row.entity_type, entity_id: row.entity_id, feedback_source: "campaign", feedback_type: "campaign_approved", feedback_value: row.campaign_type, created_by: userId });
}
