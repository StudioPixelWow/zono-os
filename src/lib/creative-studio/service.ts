// ============================================================================
// ZONO — Creative Studio · Service (server-only)
// ----------------------------------------------------------------------------
// Loads the studio for any entity (agent/office/property/project), resolves the
// entity name, lists assets, loads/creates the Marketing DNA profile, and
// applies deterministic feedback learning. No AI calls (Phase 2 adds Vision).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import { DEFAULT_AVOID_RULES, DEFAULT_PREFER_RULES, applyFeedbackToScores, type DnaScores } from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;

async function resolveEntityName(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<string> {
  try {
    if (entityType === "agent") { const { data } = await supabase.from("users").select("full_name").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { full_name?: string } | null)?.full_name ?? "סוכן"; }
    if (entityType === "office") { const { data } = await supabase.from("organizations").select("name").eq("id", entityId).maybeSingle(); return (data as { name?: string } | null)?.name ?? "משרד"; }
    if (entityType === "property") { const { data } = await supabase.from("properties").select("title").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { title?: string } | null)?.title ?? "נכס"; }
    if (entityType === "project") { const { data } = await supabase.from("projects").select("name").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { name?: string } | null)?.name ?? "פרויקט"; }
  } catch { /* fall through */ }
  return "ישות";
}

export type AssetRow = Record<string, unknown>;
export type DnaRow = Record<string, unknown>;
export interface CreativeStudio {
  entityType: string; entityId: string; entityName: string;
  assets: AssetRow[];
  dna: DnaRow | null;
  defaultAvoidRules: string[]; defaultPreferRules: string[];
  stats: { totalAssets: number; approvedReferences: number; rejectedReferences: number; competitorReferences: number; dnaStatus: string; lastAnalyzedAt: string | null; feedbackCount: number };
}

export async function getCreativeStudio(entityType: string, entityId: string): Promise<CreativeStudio> {
  const { orgId, supabase } = await ctx();
  const entityName = await resolveEntityName(supabase, orgId, entityType, entityId);

  const { data: assets } = await supabase.from("zono_marketing_assets").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "active").order("created_at", { ascending: false }).limit(300);
  const assetRows = (assets ?? []) as AssetRow[];

  const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("*").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  const { count: feedbackCount } = await supabase.from("zono_marketing_feedback").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);

  const stats = {
    totalAssets: assetRows.length,
    approvedReferences: assetRows.filter((a) => a.is_approved_reference).length,
    rejectedReferences: assetRows.filter((a) => a.is_rejected_reference).length,
    competitorReferences: assetRows.filter((a) => a.is_competitor_reference).length,
    dnaStatus: (dna as { profile_status?: string } | null)?.profile_status ?? "none",
    lastAnalyzedAt: (dna as { last_analyzed_at?: string } | null)?.last_analyzed_at ?? null,
    feedbackCount: feedbackCount ?? 0,
  };
  return { entityType, entityId, entityName, assets: assetRows, dna: (dna as DnaRow) ?? null, defaultAvoidRules: DEFAULT_AVOID_RULES, defaultPreferRules: DEFAULT_PREFER_RULES, stats };
}

// ── DNA ensure / save ────────────────────────────────────────────────────────
export async function ensureDnaProfile(entityType: string, entityId: string): Promise<{ id: string }> {
  const { orgId, supabase } = await ctx();
  const { data: existing } = await supabase.from("zono_marketing_dna_profiles").select("id").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  if (existing) return { id: (existing as { id: string }).id };
  const { data, error } = await supabase.from("zono_marketing_dna_profiles").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, profile_status: "draft", avoid_rules: DEFAULT_AVOID_RULES as unknown as Json, brand_rules: DEFAULT_PREFER_RULES as unknown as Json }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת פרופיל ה-DNA נכשלה");
  return { id: (data as { id: string }).id };
}

export interface SaveDnaInput {
  entityType: string; entityId: string;
  dna_summary?: string; visual_personality?: string; copywriting_tone?: string; real_estate_positioning?: string;
  agent_notes?: string; office_notes?: string; seller_notes?: string; zono_notes?: string;
  brand_rules?: string[]; avoid_rules?: string[];
}
export async function saveDna(input: SaveDnaInput): Promise<void> {
  const { orgId, supabase } = await ctx();
  await ensureDnaProfile(input.entityType, input.entityId);
  const patch: Record<string, unknown> = {};
  for (const k of ["dna_summary", "visual_personality", "copywriting_tone", "real_estate_positioning", "agent_notes", "office_notes", "seller_notes", "zono_notes"] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (input.brand_rules !== undefined) patch.brand_rules = input.brand_rules as unknown as Json;
  if (input.avoid_rules !== undefined) patch.avoid_rules = input.avoid_rules as unknown as Json;
  await supabase.from("zono_marketing_dna_profiles").update(patch as never).eq("org_id", orgId).eq("entity_type", input.entityType).eq("entity_id", input.entityId);
}

export async function lockDna(entityType: string, entityId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  await ensureDnaProfile(entityType, entityId);
  await supabase.from("zono_marketing_dna_profiles").update({ profile_status: "locked" }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);
}

// ── asset flag / note / delete ─────────────────────────────────────────────────
export async function updateAssetFlags(assetId: string, flags: Record<string, boolean>): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_marketing_assets").update(flags as never).eq("org_id", orgId).eq("id", assetId);
}
export async function addAssetNote(assetId: string, note: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_marketing_assets").update({ description: note }).eq("org_id", orgId).eq("id", assetId);
}
export async function deleteAsset(assetId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  // soft-delete (keeps storage object; Phase 2 cleanup job removes orphans)
  await supabase.from("zono_marketing_assets").update({ status: "deleted" }).eq("org_id", orgId).eq("id", assetId);
}

// ── feedback (writes row + deterministic DNA nudge) ─────────────────────────────
export async function submitFeedback(input: { entityType: string; entityId: string; feedbackType: string; assetId?: string; note?: string }): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: input.entityType, entity_id: input.entityId, asset_id: input.assetId ?? null, feedback_source: "manual", feedback_type: input.feedbackType, feedback_note: input.note ?? null, created_by: userId });
  // deterministic learning: nudge the DNA scores
  await ensureDnaProfile(input.entityType, input.entityId);
  const { data: dna } = await supabase.from("zono_marketing_dna_profiles").select("luxury_score,urgency_score,modern_score,sales_aggressiveness_score,investment_focus_score,lifestyle_focus_score,seller_focus_score,buyer_focus_score,visual_density_score,ai_generated_score").eq("entity_type", input.entityType).eq("entity_id", input.entityId).maybeSingle();
  if (dna) {
    const next = applyFeedbackToScores(dna as DnaScores, input.feedbackType);
    await supabase.from("zono_marketing_dna_profiles").update(next).eq("org_id", orgId).eq("entity_type", input.entityType).eq("entity_id", input.entityId);
  }
}

// ── analysis job (Phase 1 stub — queues only; Phase 2 runs Vision server-side) ──
export async function requestAnalysis(entityType: string, entityId: string): Promise<{ jobId: string }> {
  const { orgId, supabase } = await ctx();
  const { data: assets } = await supabase.from("zono_marketing_assets").select("id").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "active").limit(100);
  const ids = ((assets ?? []) as { id: string }[]).map((a) => a.id);
  const { data, error } = await supabase.from("zono_marketing_analysis_jobs").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, status: "pending", job_type: "marketing_dna_analysis", input_asset_ids: ids }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת משימת הניתוח נכשלה");
  return { jobId: (data as { id: string }).id };
}

// ── launcher: recent entities that already have studio data ─────────────────────
export interface StudioEntityRef { entityType: string; entityId: string; entityName: string; assetCount: number; dnaStatus: string }
export async function listStudioEntities(): Promise<StudioEntityRef[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_marketing_assets").select("entity_type,entity_id").eq("org_id", orgId).eq("status", "active").limit(500);
  const counts = new Map<string, { entityType: string; entityId: string; n: number }>();
  for (const r of (data ?? []) as { entity_type: string; entity_id: string }[]) {
    const k = `${r.entity_type}:${r.entity_id}`;
    const cur = counts.get(k) ?? { entityType: r.entity_type, entityId: r.entity_id, n: 0 };
    cur.n++; counts.set(k, cur);
  }
  const refs: StudioEntityRef[] = [];
  for (const c of Array.from(counts.values()).slice(0, 50)) {
    const name = await resolveEntityName(supabase, orgId, c.entityType, c.entityId);
    refs.push({ entityType: c.entityType, entityId: c.entityId, entityName: name, assetCount: c.n, dnaStatus: "—" });
  }
  return refs.sort((a, b) => b.assetCount - a.assetCount);
}

export type { Json };
