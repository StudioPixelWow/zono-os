/**
 * Matching Intelligence repositories — RLS-scoped (server-only).
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type MatchProfileRow = DB["match_intelligence_profiles"]["Row"];
export type MatchRiskRow = DB["match_risks"]["Row"];
export type MatchObjectionRow = DB["match_objections"]["Row"];
export type MatchOpportunityRow = DB["match_opportunities"]["Row"];
export type RevenueSignalRow = DB["revenue_signals"]["Row"];

async function insertMany<T extends keyof DB>(table: T, rows: DB[T]["Insert"][]): Promise<void> {
  if (!rows.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) throw new Error(error.message);
}

export const matchIntelligenceRepository = {
  async getById(id: string): Promise<MatchProfileRow | null> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_intelligence_profiles").select("*").eq("id", id).maybeSingle();
    return data ?? null;
  },
  async listForOrg(): Promise<MatchProfileRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_intelligence_profiles").select("*").order("closing_probability", { ascending: false }).limit(1000);
    return data ?? [];
  },
  async listForBuyer(buyerId: string): Promise<MatchProfileRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_intelligence_profiles").select("*").eq("buyer_id", buyerId).order("closing_probability", { ascending: false }).limit(20);
    return data ?? [];
  },
  async listForProperty(propertyId: string): Promise<MatchProfileRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_intelligence_profiles").select("*").eq("property_id", propertyId).order("closing_probability", { ascending: false }).limit(20);
    return data ?? [];
  },
  async listForSeller(sellerId: string): Promise<MatchProfileRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_intelligence_profiles").select("*").eq("seller_id", sellerId).order("closing_probability", { ascending: false }).limit(20);
    return data ?? [];
  },
  async upsertMany(rows: DB["match_intelligence_profiles"]["Insert"][]): Promise<void> {
    if (!rows.length) return;
    const supabase = await createClient();
    const { error } = await supabase.from("match_intelligence_profiles").upsert(rows as never, { onConflict: "org_id,buyer_id,property_id" });
    if (error) throw new Error(error.message);
  },
  async update(id: string, patch: DB["match_intelligence_profiles"]["Update"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("match_intelligence_profiles").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
};

export const matchRiskRepository = {
  async listByMatch(matchId: string): Promise<MatchRiskRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_risks").select("*").eq("match_id", matchId).order("detected_at", { ascending: false });
    return data ?? [];
  },
  insertMany: (rows: DB["match_risks"]["Insert"][]) => insertMany("match_risks", rows),
  async clearForOrg(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("match_risks").delete().eq("org_id", orgId);
  },
  async resolve(id: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("match_risks").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
  },
};

export const matchObjectionRepository = {
  async listByMatch(matchId: string): Promise<MatchObjectionRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_objections").select("*").eq("match_id", matchId).order("created_at", { ascending: false });
    return data ?? [];
  },
  async insert(row: DB["match_objections"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("match_objections").insert(row);
    if (error) throw new Error(error.message);
  },
  async resolve(id: string, action: string | null): Promise<void> {
    const supabase = await createClient();
    await supabase.from("match_objections").update({ resolved: true, resolved_at: new Date().toISOString(), resolution_action: action }).eq("id", id);
  },
};

export const matchOpportunityRepository = {
  async listForOrg(): Promise<MatchOpportunityRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("match_opportunities").select("*").eq("status", "open").order("opportunity_score", { ascending: false }).limit(50);
    return data ?? [];
  },
  insertMany: (rows: DB["match_opportunities"]["Insert"][]) => insertMany("match_opportunities", rows),
  async clearForOrg(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("match_opportunities").delete().eq("org_id", orgId);
  },
};

export const revenueSignalRepository = {
  async listForOrg(): Promise<RevenueSignalRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("revenue_signals").select("*").limit(1000);
    return data ?? [];
  },
  insertMany: (rows: DB["revenue_signals"]["Insert"][]) => insertMany("revenue_signals", rows),
  async clearForOrg(orgId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("revenue_signals").delete().eq("org_id", orgId);
  },
};
