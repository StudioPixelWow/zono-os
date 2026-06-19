/**
 * Decision Intelligence repositories — RLS-scoped (server-only).
 * Derived tables (attention/opportunity/queue/recommendations) are regenerated
 * on recalc, so each exposes a clear() + insertMany().
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type DecisionProfileRow = DB["decision_intelligence_profiles"]["Row"];
export type AttentionItemRow = DB["attention_items"]["Row"];
export type OpportunityRow = DB["opportunity_signals"]["Row"];
export type QueueRow = DB["decision_queue"]["Row"];
export type RecommendationRow = DB["decision_recommendations"]["Row"];

async function insertMany<T extends keyof DB>(table: T, rows: DB[T]["Insert"][]): Promise<void> {
  if (!rows.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) throw new Error(error.message);
}

export const decisionIntelligenceRepository = {
  async get(orgId: string): Promise<DecisionProfileRow | null> {
    const supabase = await createClient();
    const { data } = await supabase.from("decision_intelligence_profiles").select("*").eq("org_id", orgId).maybeSingle();
    return data ?? null;
  },
  async ensure(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("decision_intelligence_profiles").upsert({ org_id: orgId } as never, { onConflict: "org_id", ignoreDuplicates: true });
  },
  async update(orgId: string, patch: DB["decision_intelligence_profiles"]["Update"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("decision_intelligence_profiles").update(patch).eq("org_id", orgId);
    if (error) throw new Error(error.message);
  },
};

export const attentionRepository = {
  async listOpen(): Promise<AttentionItemRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("attention_items").select("*").eq("status", "open").order("attention_score", { ascending: false }).limit(100);
    return data ?? [];
  },
  async clearOpen(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("attention_items").delete().eq("org_id", orgId).eq("status", "open");
  },
  insertMany: (rows: DB["attention_items"]["Insert"][]) => insertMany("attention_items", rows),
  async setStatus(id: string, status: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("attention_items").update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id);
  },
};

export const opportunityRepository = {
  async list(): Promise<OpportunityRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("opportunity_signals").select("*").eq("status", "open").order("opportunity_score", { ascending: false }).limit(50);
    return data ?? [];
  },
  async clear(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("opportunity_signals").delete().eq("org_id", orgId);
  },
  insertMany: (rows: DB["opportunity_signals"]["Insert"][]) => insertMany("opportunity_signals", rows),
};

export const decisionQueueRepository = {
  async list(): Promise<QueueRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("decision_queue").select("*").order("rank_position", { ascending: true }).limit(50);
    return data ?? [];
  },
  async clear(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("decision_queue").delete().eq("org_id", orgId);
  },
  insertMany: (rows: DB["decision_queue"]["Insert"][]) => insertMany("decision_queue", rows),
};

export const recommendationRepository = {
  async list(): Promise<RecommendationRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("decision_recommendations").select("*").order("urgency_score", { ascending: false }).limit(30);
    return data ?? [];
  },
  async clear(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("decision_recommendations").delete().eq("org_id", orgId);
  },
  insertMany: (rows: DB["decision_recommendations"]["Insert"][]) => insertMany("decision_recommendations", rows),
};
