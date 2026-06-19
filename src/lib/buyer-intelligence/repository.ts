/**
 * Buyer Intelligence repositories — RLS-scoped (server-only).
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type BuyerProfileRow = DB["buyer_intelligence_profiles"]["Row"];
export type BuyerMissionRow = DB["buyer_missions"]["Row"];
export type BuyerRiskRow = DB["buyer_risks"]["Row"];
export type BuyerTouchpointRow = DB["buyer_touchpoints"]["Row"];
export type BuyerObjectionRow = DB["buyer_objections"]["Row"];
export type BuyerCommitmentRow = DB["buyer_commitments"]["Row"];

async function insertMany<T extends keyof DB>(table: T, rows: DB[T]["Insert"][]): Promise<void> {
  if (!rows.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) throw new Error(error.message);
}

export const buyerIntelligenceRepository = {
  async getByBuyer(buyerId: string): Promise<BuyerProfileRow | null> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_intelligence_profiles").select("*").eq("buyer_id", buyerId).maybeSingle();
    return data ?? null;
  },
  async create(row: DB["buyer_intelligence_profiles"]["Insert"]): Promise<BuyerProfileRow> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("buyer_intelligence_profiles").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(buyerId: string, patch: DB["buyer_intelligence_profiles"]["Update"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("buyer_intelligence_profiles").update(patch).eq("buyer_id", buyerId);
    if (error) throw new Error(error.message);
  },
  async listForOrg(): Promise<BuyerProfileRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_intelligence_profiles").select("*").limit(500);
    return data ?? [];
  },
};

export const buyerMissionRepository = {
  async listByBuyer(buyerId: string): Promise<BuyerMissionRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_missions").select("*").eq("buyer_id", buyerId).order("created_at", { ascending: true });
    return data ?? [];
  },
  insertMany: (rows: DB["buyer_missions"]["Insert"][]) => insertMany("buyer_missions", rows),
};

export const buyerRiskRepository = {
  async listByBuyer(buyerId: string): Promise<BuyerRiskRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_risks").select("*").eq("buyer_id", buyerId).order("detected_at", { ascending: false });
    return data ?? [];
  },
  async listOpen(buyerId: string): Promise<BuyerRiskRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_risks").select("*").eq("buyer_id", buyerId).eq("status", "open");
    return data ?? [];
  },
  insertMany: (rows: DB["buyer_risks"]["Insert"][]) => insertMany("buyer_risks", rows),
  async clearOpen(buyerId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("buyer_risks").delete().eq("buyer_id", buyerId).eq("status", "open");
  },
  async resolve(id: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("buyer_risks").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
  },
};

export const buyerTouchpointRepository = {
  async listByBuyer(buyerId: string): Promise<BuyerTouchpointRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_touchpoints").select("*").eq("buyer_id", buyerId).order("occurred_at", { ascending: false }).limit(100);
    return data ?? [];
  },
  async insert(row: DB["buyer_touchpoints"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("buyer_touchpoints").insert(row);
    if (error) throw new Error(error.message);
  },
};

export const buyerObjectionRepository = {
  async listByBuyer(buyerId: string): Promise<BuyerObjectionRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_objections").select("*").eq("buyer_id", buyerId).order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  },
  async insert(row: DB["buyer_objections"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("buyer_objections").insert(row);
    if (error) throw new Error(error.message);
  },
  async resolve(id: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("buyer_objections").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
  },
};

export const buyerCommitmentRepository = {
  async listByBuyer(buyerId: string): Promise<BuyerCommitmentRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("buyer_commitments").select("*").eq("buyer_id", buyerId).order("due_date", { ascending: true, nullsFirst: false }).limit(100);
    return data ?? [];
  },
  async insert(row: DB["buyer_commitments"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("buyer_commitments").insert(row);
    if (error) throw new Error(error.message);
  },
  async setStatus(id: string, status: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("buyer_commitments").update({ status, fulfilled_at: status === "fulfilled" ? new Date().toISOString() : null }).eq("id", id);
  },
};
