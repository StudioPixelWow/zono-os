/**
 * Seller Intelligence repositories — RLS-scoped (server-only).
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type SellerProfileRow = DB["seller_intelligence_profiles"]["Row"];
export type SellerMissionRow = DB["seller_missions"]["Row"];
export type SellerRiskRow = DB["seller_risks"]["Row"];
export type SellerTouchpointRow = DB["seller_touchpoints"]["Row"];
export type SellerCommitmentRow = DB["seller_commitments"]["Row"];

async function insertMany<T extends keyof DB>(table: T, rows: DB[T]["Insert"][]): Promise<void> {
  if (!rows.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) throw new Error(error.message);
}

export const sellerIntelligenceRepository = {
  async getBySeller(sellerId: string): Promise<SellerProfileRow | null> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("seller_intelligence_profiles")
      .select("*")
      .eq("seller_id", sellerId)
      .maybeSingle();
    return data ?? null;
  },
  async create(row: DB["seller_intelligence_profiles"]["Insert"]): Promise<SellerProfileRow> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seller_intelligence_profiles")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(sellerId: string, patch: DB["seller_intelligence_profiles"]["Update"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("seller_intelligence_profiles")
      .update(patch)
      .eq("seller_id", sellerId);
    if (error) throw new Error(error.message);
  },
  async listForOrg(): Promise<SellerProfileRow[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("seller_intelligence_profiles").select("*").limit(500);
    return data ?? [];
  },
};

export const sellerMissionRepository = {
  async listBySeller(sellerId: string): Promise<SellerMissionRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("seller_missions")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: true });
    return data ?? [];
  },
  insertMany: (rows: DB["seller_missions"]["Insert"][]) => insertMany("seller_missions", rows),
};

export const sellerRiskRepository = {
  async listBySeller(sellerId: string): Promise<SellerRiskRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("seller_risks")
      .select("*")
      .eq("seller_id", sellerId)
      .order("detected_at", { ascending: false });
    return data ?? [];
  },
  async listOpen(sellerId: string): Promise<SellerRiskRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("seller_risks")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("status", "open");
    return data ?? [];
  },
  insertMany: (rows: DB["seller_risks"]["Insert"][]) => insertMany("seller_risks", rows),
  async clearOpen(sellerId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("seller_risks").delete().eq("seller_id", sellerId).eq("status", "open");
  },
  async resolve(id: string): Promise<void> {
    const supabase = await createClient();
    await supabase
      .from("seller_risks")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
  },
};

export const sellerTouchpointRepository = {
  async listBySeller(sellerId: string): Promise<SellerTouchpointRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("seller_touchpoints")
      .select("*")
      .eq("seller_id", sellerId)
      .order("occurred_at", { ascending: false })
      .limit(100);
    return data ?? [];
  },
  async insert(row: DB["seller_touchpoints"]["Insert"]): Promise<SellerTouchpointRow> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("seller_touchpoints").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
};

export const sellerCommitmentRepository = {
  async listBySeller(sellerId: string): Promise<SellerCommitmentRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("seller_commitments")
      .select("*")
      .eq("seller_id", sellerId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(100);
    return data ?? [];
  },
  async insert(row: DB["seller_commitments"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("seller_commitments").insert(row);
    if (error) throw new Error(error.message);
  },
  async setStatus(id: string, status: string): Promise<void> {
    const supabase = await createClient();
    await supabase
      .from("seller_commitments")
      .update({ status, fulfilled_at: status === "fulfilled" ? new Date().toISOString() : null })
      .eq("id", id);
  },
};
