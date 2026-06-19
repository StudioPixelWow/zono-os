/**
 * Sellers repository — minimal RLS-scoped access (server-only).
 * Sellers are managed mainly via property ownership; this provides listing and
 * lookup so the Seller Intelligence OS has pages to render on.
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];

export async function listSellers(): Promise<SellerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSellerById(id: string): Promise<SellerRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("sellers").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export interface NewSellerInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  motivation?: string | null;
}

export async function createSeller(input: NewSellerInput, orgId: string, ownerId: string): Promise<SellerRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sellers")
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      full_name: input.fullName.trim() || "מוכר ללא שם",
      phone: input.phone || null,
      email: input.email || null,
      motivation: (input.motivation as SellerRow["motivation"]) || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Count properties per seller (for the list view). */
export async function sellerPropertyCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("properties").select("seller_id").not("seller_id", "is", null);
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    if (r.seller_id) map.set(r.seller_id, (map.get(r.seller_id) ?? 0) + 1);
  }
  return map;
}
