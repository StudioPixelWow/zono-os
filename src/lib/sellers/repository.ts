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

import type { Seller360Input } from "./types";

export interface NewSellerInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  motivation?: string | null;
}

function to360Record(i: Seller360Input) {
  return {
    full_name: i.fullName.trim() || "מוכר ללא שם",
    phone: i.phone || null,
    secondary_phone: i.secondaryPhone || null,
    email: i.email || null,
    address: i.address || null,
    city: i.city || null,
    seller_type: i.sellerType || null,
    motivation_type: i.motivationType || null,
    motivation_notes: i.motivationNotes || null,
    urgency_level: i.urgencyLevel || null,
    target_sale_date: i.targetSaleDate || null,
    must_sell_by: i.mustSellBy || null,
    desired_price: i.desiredPrice ?? null,
    minimum_price: i.minimumPrice ?? null,
    dream_price: i.dreamPrice ?? null,
    mortgage_exists: i.mortgageExists ?? false,
    mortgage_balance: i.mortgageBalance ?? null,
    financial_notes: i.financialNotes || null,
    decision_style: i.decisionStyle || null,
    main_objection: i.mainObjection || null,
    negotiation_sensitivity: i.negotiationSensitivity || null,
    preferred_contact_method: i.preferredContactMethod || null,
    preferred_contact_time: i.preferredContactTime || null,
    communication_notes: i.communicationNotes || null,
    price_sensitivity_score: i.priceSensitivityScore ?? 50,
    time_sensitivity_score: i.timeSensitivityScore ?? 50,
    trust_sensitivity_score: i.trustSensitivityScore ?? 50,
    marketing_openness_score: i.marketingOpennessScore ?? 50,
    negotiation_flexibility_score: i.negotiationFlexibilityScore ?? 50,
    cooperation_score: i.cooperationScore ?? 50,
    available_for_showings: i.availableForShowings ?? true,
    allows_marketing: i.allowsMarketing ?? true,
    allows_signage: i.allowsSignage ?? false,
    allows_exclusive: i.allowsExclusive ?? false,
    has_signed_agreement: i.hasSignedAgreement ?? false,
  };
}

export async function createSeller360(input: Seller360Input, orgId: string, ownerId: string): Promise<SellerRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sellers")
    .insert({ ...to360Record(input), org_id: orgId, owner_id: ownerId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeller360(id: string, input: Seller360Input): Promise<SellerRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sellers")
    .update(to360Record(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Search sellers by name / phone / email (RLS-scoped). */
export async function searchSellers(query: string): Promise<SellerRow[]> {
  const supabase = await createClient();
  let q = supabase.from("sellers").select("*").order("updated_at", { ascending: false }).limit(20);
  const term = query.trim();
  if (term) q = q.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const { data } = await q;
  return data ?? [];
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
