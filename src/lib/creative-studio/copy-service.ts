// ============================================================================
// ZONO — Copy Service (server-only)
// ----------------------------------------------------------------------------
// Generates marketing copy for a creative asset (driven by the asset + its
// campaign's Campaign DNA + the entity Marketing DNA + approved/rejected
// patterns + local intel), reviews/scores it, and persists. Approve/reject
// feed the learning loop. RLS-scoped. No designs/visuals.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { generateCopy as runGenerator } from "./copy-ai";
import { reviewCopy } from "./copy-review";
import type { CopyContext } from "./copy-engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
export type CopyRow = Record<string, unknown>;

async function propertyHints(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<{ propertyType?: string | null; neighborhood?: string | null; city?: string | null }> {
  if (entityType !== "property") return {};
  try { const { data } = await supabase.from("properties").select("type,city,neighborhood").eq("org_id", orgId).eq("id", entityId).maybeSingle(); const p = data as { type?: string; city?: string; neighborhood?: string } | null; return { propertyType: p?.type ?? null, city: p?.city ?? null, neighborhood: p?.neighborhood ?? null }; }
  catch { return {}; }
}

function cdnaScores(meta: unknown): { luxury: number; investment: number; lifestyle: number; urgency: number; seller: number; buyer: number } {
  const d = (meta && typeof meta === "object" ? (meta as { campaign_dna?: Record<string, number> }).campaign_dna : null) ?? {};
  const n = (k: string, def = 50) => (typeof d[k] === "number" ? d[k] : def);
  return { luxury: n("luxury"), investment: n("investment"), lifestyle: n("lifestyle"), urgency: n("urgency"), seller: n("seller"), buyer: n("buyer") };
}

export async function listEntityCopy(entityType: string, entityId: string): Promise<CopyRow[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_copy_assets").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).neq("status", "deleted").order("is_favorite", { ascending: false }).order("confidence_score", { ascending: false }).limit(200);
  return (data ?? []) as CopyRow[];
}

export async function generateCopyForAsset(creativeAssetId: string): Promise<{ created: number; provider: string }> {
  const { orgId, supabase } = await ctx();
  const { data: asset } = await supabase.from("zono_creative_assets").select("*").eq("org_id", orgId).eq("id", creativeAssetId).maybeSingle();
  const a = asset as Record<string, unknown> | null;
  if (!a) throw new Error("הנכס לא נמצא");
  const campaignId = a.campaign_id as string;

  const { data: camp } = await supabase.from("zono_campaigns").select("entity_type,entity_id,title,generation_metadata").eq("org_id", orgId).eq("id", campaignId).maybeSingle();
  const c = camp as { entity_type: string; entity_id: string; title: string; generation_metadata: unknown } | null;
  if (!c) throw new Error("הקמפיין לא נמצא");
  const cd = cdnaScores(c.generation_metadata);

  let approvedPatterns: string[] = []; let rejectedPatterns: string[] = []; let toneNote: string | null = null;
  try {
    const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("approved_patterns,rejected_patterns,copywriting_tone,agent_notes,zono_notes").eq("entity_type", c.entity_type).eq("entity_id", c.entity_id).maybeSingle();
    const d = dna as Record<string, unknown> | null;
    const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === "string") as string[] : []);
    approvedPatterns = arr(d?.approved_patterns); rejectedPatterns = arr(d?.rejected_patterns);
    toneNote = [d?.copywriting_tone, d?.agent_notes, d?.zono_notes].filter((x) => typeof x === "string").join(" · ") || null;
  } catch { /* defaults */ }

  const hints = await propertyHints(supabase, orgId, c.entity_type, c.entity_id);
  const copyCtx: CopyContext = {
    entityType: c.entity_type, entityName: c.title ?? "ישות", assetType: (a.asset_type as string) ?? "feed_post",
    objective: (a.objective as string) ?? "lead_generation", audience: (a.audience as string) ?? "קהל מקומי",
    marketingAngle: (a.marketing_angle as string) ?? "", emotionalTrigger: (a.emotional_trigger as string) ?? "", copyHook: (a.copy_hook as string) ?? "", ctaStyle: (a.cta_style as string) ?? "וואטסאפ ישיר",
    ...cd, ...hints, approvedPatterns, rejectedPatterns, toneNote,
  };

  const { items, provider } = await runGenerator(copyCtx);

  // archive prior generated (non-approved, non-favorite) copy for this asset
  await supabase.from("zono_copy_assets").update({ status: "archived" }).eq("org_id", orgId).eq("creative_asset_id", creativeAssetId).eq("status", "generated").eq("is_approved", false).eq("is_favorite", false);

  const rows = items.map((it) => {
    const rv = reviewCopy(it, approvedPatterns, rejectedPatterns);
    return {
      org_id: orgId, creative_asset_id: creativeAssetId, campaign_id: campaignId, entity_type: c.entity_type, entity_id: c.entity_id,
      copy_type: it.copy_type, title: it.title, headline: it.headline || null, subheadline: it.subheadline || null, body: it.body || null, cta: it.cta || null,
      platform: it.platform || null, language: "he", tone: it.tone || null, audience: it.audience || null, reasoning: it.reasoning || null,
      status: "generated", confidence_score: rv.confidence, metadata: { provider, review: rv } as unknown as Json,
    };
  });
  if (rows.length) await supabase.from("zono_copy_assets").insert(rows as never);
  return { created: rows.length, provider };
}

export async function setCopyFavorite(copyId: string, value: boolean): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_copy_assets").update({ is_favorite: value }).eq("org_id", orgId).eq("id", copyId);
}
export async function approveCopy(copyId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_copy_assets").update({ is_approved: true, status: "approved" }).eq("org_id", orgId).eq("id", copyId).select("entity_type,entity_id,copy_type").single();
  const row = data as { entity_type: string; entity_id: string; copy_type: string } | null;
  if (row) await learn(supabase, orgId, row.entity_type, row.entity_id, "copy_approved", row.copy_type, userId);
}
export async function rejectCopy(copyId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_copy_assets").update({ is_approved: false, status: "rejected" }).eq("org_id", orgId).eq("id", copyId).select("entity_type,entity_id,copy_type").single();
  const row = data as { entity_type: string; entity_id: string; copy_type: string } | null;
  if (row) await learn(supabase, orgId, row.entity_type, row.entity_id, "copy_rejected", row.copy_type, userId);
}
export async function regenerateCopy(copyId: string): Promise<{ created: number; provider: string }> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_copy_assets").select("creative_asset_id").eq("org_id", orgId).eq("id", copyId).maybeSingle();
  const cid = (data as { creative_asset_id?: string } | null)?.creative_asset_id;
  if (!cid) throw new Error("לא נמצא נכס מקור");
  return generateCopyForAsset(cid);
}

async function learn(supabase: DB, orgId: string, entityType: string, entityId: string, feedbackType: string, value: string, userId: string) {
  try { await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, feedback_source: "copy", feedback_type: feedbackType, feedback_value: value, created_by: userId }); }
  catch { /* best-effort */ }
}
