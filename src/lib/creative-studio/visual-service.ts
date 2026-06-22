// ============================================================================
// ZONO — AI Visual Generation Service (server-only)
// ----------------------------------------------------------------------------
// Generates visuals for a creative output from Marketing/Visual/Campaign DNA +
// property + location. Prompts are internal only. Real bytes upload to the
// generated-zono-visuals bucket; mock returns an SVG data URL. Approved visuals
// auto-inject into the creative output's render_data. RLS-scoped.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { buildVisualDNA, scoreVisual, visualTypeForOutput, type MarketingDnaScores } from "./visual-dna";
import { buildVisualPrompt, generationReason } from "./visual-providers/prompt";
import { generateVisual } from "./visual-providers";

const BUCKET = "generated-zono-visuals";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
export type VisualRow = Record<string, unknown>;

function cdnaScores(meta: unknown): MarketingDnaScores {
  const d = (meta && typeof meta === "object" ? (meta as { campaign_dna?: Record<string, number> }).campaign_dna : null) ?? {};
  const n = (k: string, def = 50) => (typeof d[k] === "number" ? d[k] : def);
  return { luxury: n("luxury"), investment: n("investment"), lifestyle: n("lifestyle"), urgency: n("urgency"), modern: 50, aiGenerated: 30, confidence: 50 };
}

async function propertyData(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<{ propertyType?: string | null; city?: string | null; neighborhood?: string | null }> {
  if (entityType !== "property") return {};
  try { const { data } = await supabase.from("properties").select("type,city,neighborhood").eq("org_id", orgId).eq("id", entityId).maybeSingle(); const p = data as { type?: string; city?: string; neighborhood?: string } | null; return { propertyType: p?.type ?? null, city: p?.city ?? null, neighborhood: p?.neighborhood ?? null }; }
  catch { return {}; }
}

export async function listEntityVisuals(entityType: string, entityId: string): Promise<VisualRow[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_visual_assets").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).neq("status", "deleted").order("is_favorite", { ascending: false }).order("overall_score", { ascending: false }).limit(120);
  return (data ?? []) as VisualRow[];
}

export async function generateVisualForOutput(creativeOutputId: string, variationMode?: string): Promise<{ created: number; provider: string }> {
  const { orgId, supabase } = await ctx();
  const { data: output } = await supabase.from("zono_creative_outputs").select("*").eq("org_id", orgId).eq("id", creativeOutputId).maybeSingle();
  const o = output as Record<string, unknown> | null;
  if (!o) throw new Error("הקריאייטיב לא נמצא");

  const render = (o.render_data && typeof o.render_data === "object" ? o.render_data : {}) as { width?: number; height?: number; layoutId?: string; palette?: { bg?: string; accent?: string } };
  const aspect: "portrait" | "square" | "landscape" = (render.width ?? 1) < (render.height ?? 1) ? "portrait" : (render.width ?? 1) > (render.height ?? 1) ? "landscape" : "square";

  // DNA scores from campaign + marketing dna
  let cd = { luxury: 50, investment: 50, lifestyle: 50, urgency: 50 };
  let colors: string[] = []; let approvedPatterns: string[] = []; let rejectedPatterns: string[] = []; let modern = 50; let aiGen = 30; let confidence = 50;
  try {
    const { data: camp } = await supabase.from("zono_campaigns").select("generation_metadata").eq("org_id", orgId).eq("id", o.campaign_id as string).maybeSingle();
    cd = cdnaScores((camp as { generation_metadata?: unknown } | null)?.generation_metadata);
  } catch { /* default */ }
  try {
    const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("primary_colors,accent_colors,approved_patterns,rejected_patterns,modern_score,ai_generated_score,ai_confidence_score").eq("entity_type", o.entity_type as string).eq("entity_id", o.entity_id as string).maybeSingle();
    const d = dna as Record<string, unknown> | null;
    const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === "string") as string[] : []);
    colors = [...arr(d?.primary_colors), ...arr(d?.accent_colors)].slice(0, 4);
    approvedPatterns = arr(d?.approved_patterns); rejectedPatterns = arr(d?.rejected_patterns);
    modern = typeof d?.modern_score === "number" ? (d.modern_score as number) : 50;
    aiGen = typeof d?.ai_generated_score === "number" ? (d.ai_generated_score as number) : 30;
    confidence = typeof d?.ai_confidence_score === "number" ? (d.ai_confidence_score as number) : 50;
  } catch { /* default */ }

  const scores: MarketingDnaScores = { luxury: cd.luxury, investment: cd.investment, lifestyle: cd.lifestyle, urgency: cd.urgency, modern, aiGenerated: aiGen, confidence };
  const vdna = buildVisualDNA(scores, colors);
  const pdata = await propertyData(supabase, orgId, o.entity_type as string, o.entity_id as string);
  const visualType = visualTypeForOutput(o.output_type as string, o.entity_type as string, render.layoutId);
  const priceTier = scores.luxury >= 75 ? "luxury" : scores.luxury >= 55 ? "premium" : "mid-market";

  const promptInput = { visualType, entityType: o.entity_type as string, entityName: (o.title as string) ?? "", vdna, ...pdata, priceTier, approvedPatterns, rejectedPatterns, variationMode: variationMode ?? null };
  const prompt = buildVisualPrompt(promptInput); // INTERNAL — never stored/shown
  const reason = generationReason(promptInput);

  const result = await generateVisual({ visualType, entityName: (o.title as string) ?? "", prompt, vdna, aspect });

  let imageUrl: string | null = null; let storagePath: string | null = null;
  if (result.kind === "dataurl") { imageUrl = result.dataUrl; }
  else {
    try {
      const bytes = Buffer.from(result.b64, "base64");
      const path = `${orgId}/${o.entity_type}/${o.entity_id}/${visualType}/${Date.now()}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: result.mime, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      imageUrl = pub.publicUrl; storagePath = path;
    } catch {
      // storage failed → keep row without image (still scored), do not crash
      imageUrl = null;
    }
  }

  const sc = scoreVisual(visualType, vdna, o.entity_type as string, colors.length > 0, rejectedPatterns, reason);
  const { error } = await supabase.from("zono_visual_assets").insert({
    org_id: orgId, entity_type: o.entity_type, entity_id: o.entity_id, campaign_id: o.campaign_id, creative_output_id: creativeOutputId,
    visual_type: visualType, provider: result.provider, image_url: imageUrl, thumbnail_url: imageUrl, storage_path: storagePath, generation_reason: reason,
    visual_dna_snapshot: vdna as unknown as Json, metadata: { variationMode: variationMode ?? null } as Json,
    brand_match_score: sc.brandMatch, realism_score: sc.realism, property_relevance_score: sc.propertyRelevance, marketing_relevance_score: sc.marketingRelevance, conversion_score: sc.conversion, overall_score: sc.overall,
    status: "generated",
  } as never);
  if (error) throw new Error(error.message);
  return { created: 1, provider: result.provider };
}

export async function setVisualFavorite(visualId: string, value: boolean): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_visual_assets").update({ is_favorite: value }).eq("org_id", orgId).eq("id", visualId);
}

/** Approve + AUTO-INJECT the image into the linked creative output's render_data. */
export async function approveVisual(visualId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data: v } = await supabase.from("zono_visual_assets").update({ is_approved: true, is_rejected: false, status: "approved" }).eq("org_id", orgId).eq("id", visualId).select("creative_output_id,image_url,visual_type,entity_type,entity_id").single();
  const vis = v as { creative_output_id: string | null; image_url: string | null; visual_type: string; entity_type: string; entity_id: string } | null;
  if (vis?.creative_output_id && vis.image_url) {
    const { data: out } = await supabase.from("zono_creative_outputs").select("render_data").eq("org_id", orgId).eq("id", vis.creative_output_id).maybeSingle();
    const rd = (out as { render_data?: Record<string, unknown> } | null)?.render_data;
    if (rd && Array.isArray((rd as { blocks?: unknown[] }).blocks)) {
      const blocks = ((rd as { blocks: Record<string, unknown>[] }).blocks).map((b) => b.component === "image_placeholder" ? { ...b, imageUrl: vis.image_url } : b);
      const nextRd = { ...rd, blocks } as unknown as Json;
      await supabase.from("zono_creative_outputs").update({ render_data: nextRd, preview_url: vis.image_url, thumbnail_url: vis.image_url }).eq("org_id", orgId).eq("id", vis.creative_output_id);
    }
  }
  if (vis) await learn(supabase, orgId, vis.entity_type, vis.entity_id, "visual_approved", vis.visual_type, userId);
}

export async function rejectVisual(visualId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_visual_assets").update({ is_rejected: true, is_approved: false, status: "rejected" }).eq("org_id", orgId).eq("id", visualId).select("entity_type,entity_id,visual_type").single();
  const row = data as { entity_type: string; entity_id: string; visual_type: string } | null;
  if (row) await learn(supabase, orgId, row.entity_type, row.entity_id, "visual_rejected", row.visual_type, userId);
}

export async function generateVisualVariation(visualId: string, mode: string): Promise<{ created: number; provider: string }> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_visual_assets").select("creative_output_id").eq("org_id", orgId).eq("id", visualId).maybeSingle();
  const oid = (data as { creative_output_id?: string } | null)?.creative_output_id;
  if (!oid) throw new Error("לא נמצא קריאייטיב מקור");
  return generateVisualForOutput(oid, mode);
}

async function learn(supabase: DB, orgId: string, entityType: string, entityId: string, feedbackType: string, value: string, userId: string) {
  try { await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, feedback_source: "visual", feedback_type: feedbackType, feedback_value: value, created_by: userId }); }
  catch { /* best-effort */ }
}
