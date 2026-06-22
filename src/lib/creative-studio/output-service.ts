// ============================================================================
// ZONO — Creative Output Service (server-only)
// ----------------------------------------------------------------------------
// Produces real creative variants (structured render objects) for a creative
// asset: pulls the asset + its best/approved copy + Campaign DNA + Marketing
// DNA + property data + brand rules, builds variants, scores + reviews each,
// persists render_data. Approve/reject feed the learning loop. RLS-scoped.
// No image generation yet (visual blocks are placeholders → next phase).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { produceCreativeVariants, outputTypeForAsset, type ProductionContext } from "./production-engine";
import { scoreCreative, reviewCreative } from "./creative-scoring";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
export type OutputRow = Record<string, unknown>;

function cdnaScores(meta: unknown): { luxury: number; investment: number; lifestyle: number; urgency: number; seller: number; buyer: number } {
  const d = (meta && typeof meta === "object" ? (meta as { campaign_dna?: Record<string, number> }).campaign_dna : null) ?? {};
  const n = (k: string, def = 50) => (typeof d[k] === "number" ? d[k] : def);
  return { luxury: n("luxury"), investment: n("investment"), lifestyle: n("lifestyle"), urgency: n("urgency"), seller: n("seller"), buyer: n("buyer") };
}

async function propertyData(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<{ propertyType?: string | null; price?: number | null; city?: string | null; neighborhood?: string | null; features?: string[] }> {
  if (entityType !== "property") return {};
  try {
    const { data } = await supabase.from("properties").select("type,price,city,neighborhood,rooms,size_sqm").eq("org_id", orgId).eq("id", entityId).maybeSingle();
    const p = data as { type?: string; price?: number; city?: string; neighborhood?: string; rooms?: number; size_sqm?: number } | null;
    const features: string[] = [];
    if (p?.rooms) features.push(`${p.rooms} חדרים`);
    if (p?.size_sqm) features.push(`${p.size_sqm} מ״ר`);
    return { propertyType: p?.type ?? null, price: p?.price ?? null, city: p?.city ?? null, neighborhood: p?.neighborhood ?? null, features };
  } catch { return {}; }
}

export async function listEntityOutputs(entityType: string, entityId: string): Promise<OutputRow[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_outputs").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).neq("status", "deleted").order("is_favorite", { ascending: false }).order("overall_score", { ascending: false }).limit(120);
  return (data ?? []) as OutputRow[];
}

export async function generateOutputsForAsset(creativeAssetId: string): Promise<{ created: number }> {
  const { orgId, supabase } = await ctx();
  const { data: asset } = await supabase.from("zono_creative_assets").select("*").eq("org_id", orgId).eq("id", creativeAssetId).maybeSingle();
  const a = asset as Record<string, unknown> | null;
  if (!a) throw new Error("הנכס לא נמצא");
  const campaignId = a.campaign_id as string;

  const { data: camp } = await supabase.from("zono_campaigns").select("entity_type,entity_id,title,generation_metadata").eq("org_id", orgId).eq("id", campaignId).maybeSingle();
  const c = camp as { entity_type: string; entity_id: string; title: string; generation_metadata: unknown } | null;
  if (!c) throw new Error("הקמפיין לא נמצא");
  const cd = cdnaScores(c.generation_metadata);

  // best copy for this asset (approved/favorite first, else highest confidence)
  const { data: copyRows } = await supabase.from("zono_copy_assets").select("id,headline,subheadline,cta,copy_type,confidence_score,is_approved").eq("org_id", orgId).eq("creative_asset_id", creativeAssetId).neq("status", "deleted").order("is_approved", { ascending: false }).order("confidence_score", { ascending: false }).limit(20);
  const copies = (copyRows ?? []) as { id: string; headline: string | null; subheadline: string | null; cta: string | null; copy_type: string; is_approved: boolean }[];
  const headlineCopy = copies.find((x) => x.headline) ?? copies[0];
  const subCopy = copies.find((x) => x.copy_type === "subheadline" && x.headline) ?? copies.find((x) => x.subheadline);

  let dnaColors: string[] = []; let approvedPatterns: string[] = []; let rejectedPatterns: string[] = []; let modern = 50;
  try {
    const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("primary_colors,accent_colors,approved_patterns,rejected_patterns,modern_score").eq("entity_type", c.entity_type).eq("entity_id", c.entity_id).maybeSingle();
    const d = dna as Record<string, unknown> | null;
    const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === "string") as string[] : []);
    dnaColors = [...arr(d?.primary_colors), ...arr(d?.accent_colors)].slice(0, 3);
    approvedPatterns = arr(d?.approved_patterns); rejectedPatterns = arr(d?.rejected_patterns);
    modern = typeof d?.modern_score === "number" ? (d.modern_score as number) : 50;
  } catch { /* defaults */ }

  const pdata = await propertyData(supabase, orgId, c.entity_type, c.entity_id);
  const outputType = outputTypeForAsset((a.asset_type as string) ?? "feed_post", c.entity_type);

  const pctx: ProductionContext = {
    entityType: c.entity_type, entityName: c.title ?? "ישות", outputType,
    headline: headlineCopy?.headline ?? (a.title as string) ?? c.title ?? "נכס חדש", subheadline: subCopy?.subheadline ?? subCopy?.headline ?? (a.copy_hook as string) ?? "",
    cta: headlineCopy?.cta ?? (a.cta_style as string) ?? "דברו איתנו בוואטסאפ", conceptAngle: (a.marketing_angle as string) ?? "",
    luxury: cd.luxury, investment: cd.investment, lifestyle: cd.lifestyle, urgency: cd.urgency, seller: cd.seller, buyer: cd.buyer, modern,
    dnaColors, approvedPatterns, rejectedPatterns, ...pdata,
  };

  const variants = produceCreativeVariants(pctx);

  // archive prior draft outputs for this asset (keep approved/favorite)
  await supabase.from("zono_creative_outputs").update({ status: "archived" }).eq("org_id", orgId).eq("creative_asset_id", creativeAssetId).eq("status", "draft").eq("is_approved", false).eq("is_favorite", false);

  const rows = variants.map((v) => {
    const sc = scoreCreative(v, pctx);
    const rv = reviewCreative(v, pctx);
    return {
      org_id: orgId, entity_type: c.entity_type, entity_id: c.entity_id, campaign_id: campaignId, creative_asset_id: creativeAssetId, copy_asset_id: headlineCopy?.id ?? null,
      output_type: outputType, title: `${v.layoutLabel} · ${v.palette.label}`, status: "draft",
      render_data: v as unknown as Json, generation_metadata: { provider: "render-engine", review: rv } as unknown as Json,
      brand_match_score: sc.brandMatch, marketing_match_score: sc.marketingMatch, readability_score: sc.readability, hierarchy_score: sc.hierarchy, conversion_score: sc.conversion, overall_score: sc.overall,
    };
  });
  if (rows.length) await supabase.from("zono_creative_outputs").insert(rows as never);
  return { created: rows.length };
}

export async function setOutputFavorite(outputId: string, value: boolean): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_creative_outputs").update({ is_favorite: value }).eq("org_id", orgId).eq("id", outputId);
}
export async function approveOutput(outputId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_outputs").update({ is_approved: true, status: "approved" }).eq("org_id", orgId).eq("id", outputId).select("entity_type,entity_id,output_type").single();
  const row = data as { entity_type: string; entity_id: string; output_type: string } | null;
  if (row) await learn(supabase, orgId, row.entity_type, row.entity_id, "creative_approved", row.output_type, userId);
}
export async function rejectOutput(outputId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_outputs").update({ is_approved: false, status: "rejected" }).eq("org_id", orgId).eq("id", outputId).select("entity_type,entity_id,output_type").single();
  const row = data as { entity_type: string; entity_id: string; output_type: string } | null;
  if (row) await learn(supabase, orgId, row.entity_type, row.entity_id, "creative_rejected", row.output_type, userId);
}
export async function duplicateOutput(outputId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_outputs").select("*").eq("org_id", orgId).eq("id", outputId).maybeSingle();
  const o = data as Record<string, unknown> | null;
  if (!o) throw new Error("הקריאייטיב לא נמצא");
  await supabase.from("zono_creative_outputs").insert({
    org_id: orgId, entity_type: o.entity_type, entity_id: o.entity_id, campaign_id: o.campaign_id, creative_asset_id: o.creative_asset_id, copy_asset_id: o.copy_asset_id,
    output_type: o.output_type, title: `${o.title as string} (עותק)`, status: "draft", render_data: o.render_data as Json, generation_metadata: o.generation_metadata as Json,
    brand_match_score: o.brand_match_score, marketing_match_score: o.marketing_match_score, readability_score: o.readability_score, hierarchy_score: o.hierarchy_score, conversion_score: o.conversion_score, overall_score: o.overall_score,
  } as never);
}
export async function regenerateOutput(outputId: string): Promise<{ created: number }> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_outputs").select("creative_asset_id").eq("org_id", orgId).eq("id", outputId).maybeSingle();
  const cid = (data as { creative_asset_id?: string } | null)?.creative_asset_id;
  if (!cid) throw new Error("לא נמצא נכס מקור");
  return generateOutputsForAsset(cid);
}

async function learn(supabase: DB, orgId: string, entityType: string, entityId: string, feedbackType: string, value: string, userId: string) {
  try { await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, feedback_source: "creative", feedback_type: feedbackType, feedback_value: value, created_by: userId }); }
  catch { /* best-effort */ }
}
