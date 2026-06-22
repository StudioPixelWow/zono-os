// ============================================================================
// ZONO — Creative Concept Service (server-only)
// ----------------------------------------------------------------------------
// Generates + manages strategic creative concepts per entity. Reads Marketing
// DNA + learning history (approved/rejected concept types), runs the concept
// generator (AI or deterministic engine), persists concepts. Approve/delete
// feed a learning loop. RLS-scoped. No ad/visual generation.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { contextFromDna, type EntityType } from "./concept-engine";
import { generateConcepts as runGenerator } from "./concept-ai";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;

export type ConceptRow = Record<string, unknown>;

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
  try {
    const { data } = await supabase.from("properties").select("type,city,neighborhood").eq("org_id", orgId).eq("id", entityId).maybeSingle();
    const p = data as { type?: string; city?: string; neighborhood?: string } | null;
    return { propertyType: p?.type ?? null, city: p?.city ?? null, neighborhood: p?.neighborhood ?? null };
  } catch { return {}; }
}

export async function listConcepts(entityType: string, entityId: string): Promise<ConceptRow[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_concepts").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "active").order("is_favorite", { ascending: false }).order("confidence_score", { ascending: false }).limit(40);
  return (data ?? []) as ConceptRow[];
}

/** Generate a fresh set of concepts (replaces non-favorite, non-approved active concepts). */
export async function generateConcepts(entityType: string, entityId: string): Promise<{ created: number; provider: string }> {
  const { orgId, supabase } = await ctx();
  const et = entityType as EntityType;

  const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("*").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  const dnaRow = (dna as Record<string, unknown>) ?? null;
  const dnaId = (dnaRow?.id as string) ?? null;

  // learning history from existing/approved + rejection feedback
  const { data: approvedRows } = await supabase.from("zono_creative_concepts").select("concept_type").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("is_approved", true).limit(50);
  const approvedTypes = Array.from(new Set(((approvedRows ?? []) as { concept_type: string }[]).map((r) => r.concept_type)));
  const { data: rejFb } = await supabase.from("zono_marketing_feedback").select("feedback_value").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("feedback_type", "concept_rejected").limit(100);
  const rejectedTypes = Array.from(new Set(((rejFb ?? []) as { feedback_value: string | null }[]).map((r) => r.feedback_value).filter(Boolean) as string[]));

  const name = await resolveName(supabase, orgId, entityType, entityId);
  const hints = await propertyHints(supabase, orgId, entityType, entityId);
  const context = contextFromDna(et, name, dnaRow, { approvedTypes, rejectedTypes }, hints);

  const { concepts, provider } = await runGenerator(context);

  // clear previous machine-generated concepts that are not favorited/approved
  await supabase.from("zono_creative_concepts").update({ status: "archived" }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "active").eq("is_favorite", false).eq("is_approved", false);

  const rows = concepts.map((c) => ({
    org_id: orgId, entity_type: entityType, entity_id: entityId, marketing_dna_profile_id: dnaId,
    title: c.title, concept_type: c.concept_type, description: c.description, marketing_angle: c.marketing_angle, emotional_trigger: c.emotional_trigger,
    visual_hook: c.visual_hook, copy_hook: c.copy_hook, recommended_layout: c.recommended_layout, recommended_cta_style: c.recommended_cta_style, recommended_audience: c.recommended_audience,
    reasoning: c.reasoning, confidence_score: c.confidence_score, generation_metadata: { provider } as Json,
  }));
  if (rows.length) await supabase.from("zono_creative_concepts").insert(rows);
  return { created: rows.length, provider };
}

export async function favoriteConcept(conceptId: string, value: boolean): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_creative_concepts").update({ is_favorite: value }).eq("org_id", orgId).eq("id", conceptId);
}

export async function approveConcept(conceptId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_concepts").update({ is_approved: true }).eq("org_id", orgId).eq("id", conceptId).select("entity_type,entity_id,concept_type").single();
  const row = data as { entity_type: string; entity_id: string; concept_type: string } | null;
  if (row) await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: row.entity_type, entity_id: row.entity_id, feedback_source: "concept", feedback_type: "concept_approved", feedback_value: row.concept_type, created_by: userId });
}

export async function deleteConcept(conceptId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_creative_concepts").select("entity_type,entity_id,concept_type").eq("org_id", orgId).eq("id", conceptId).maybeSingle();
  const row = data as { entity_type: string; entity_id: string; concept_type: string } | null;
  await supabase.from("zono_creative_concepts").update({ status: "deleted" }).eq("org_id", orgId).eq("id", conceptId);
  if (row) await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: row.entity_type, entity_id: row.entity_id, feedback_source: "concept", feedback_type: "concept_rejected", feedback_value: row.concept_type, created_by: userId });
}
