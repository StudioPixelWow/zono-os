/**
 * property_sellers repository + readiness validation (RLS-scoped, server-only).
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type PropertySellerRow = Database["public"]["Tables"]["property_sellers"]["Row"];

export interface LinkSellerInput {
  propertyId: string;
  sellerId: string;
  relationshipType?: string;
  ownershipPercentage?: number | null;
  isPrimary?: boolean;
  isDecisionMaker?: boolean;
  canSign?: boolean;
  receivesReports?: boolean;
  participatesInNegotiation?: boolean;
}

export const propertySellerRepository = {
  async listForProperty(propertyId: string): Promise<PropertySellerRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_sellers")
      .select("*")
      .eq("property_id", propertyId)
      .neq("status", "removed")
      .order("is_primary", { ascending: false });
    return data ?? [];
  },
  async listForSeller(sellerId: string): Promise<PropertySellerRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_sellers")
      .select("*")
      .eq("seller_id", sellerId)
      .neq("status", "removed");
    return data ?? [];
  },
  async link(orgId: string, input: LinkSellerInput): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("property_sellers").upsert(
      {
        org_id: orgId,
        property_id: input.propertyId,
        seller_id: input.sellerId,
        relationship_type: input.relationshipType ?? "owner",
        ownership_percentage: input.ownershipPercentage ?? null,
        is_primary: input.isPrimary ?? false,
        is_decision_maker: input.isDecisionMaker ?? false,
        can_sign: input.canSign ?? false,
        receives_reports: input.receivesReports ?? true,
        participates_in_negotiation: input.participatesInNegotiation ?? true,
        status: "active",
      } as never,
      { onConflict: "org_id,property_id,seller_id,relationship_type" },
    );
    if (error) throw new Error(error.message);
  },
  async unlink(id: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("property_sellers").update({ status: "removed" }).eq("id", id);
  },
  async update(id: string, patch: Database["public"]["Tables"]["property_sellers"]["Update"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("property_sellers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
  /** Make exactly one link the primary for a property. */
  async setPrimary(propertyId: string, linkId: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("property_sellers").update({ is_primary: false }).eq("property_id", propertyId);
    await supabase.from("property_sellers").update({ is_primary: true }).eq("id", linkId);
  },
};

export interface SellerReadiness {
  ready: boolean;
  hasActiveSeller: boolean;
  hasDecisionMaker: boolean;
  hasSigner: boolean;
  hasContactMethod: boolean;
  reasons: string[];
}

/** Can this property be published from a seller-readiness standpoint? */
export async function validatePropertySellerReadiness(propertyId: string): Promise<SellerReadiness> {
  const supabase = await createClient();
  const links = await propertySellerRepository.listForProperty(propertyId);
  const active = links.filter((l) => l.status === "active");
  const sellerIds = [...new Set(active.map((l) => l.seller_id))];
  let hasContactMethod = false;
  if (sellerIds.length) {
    const { data } = await supabase.from("sellers").select("phone,email,preferred_contact_method").in("id", sellerIds);
    hasContactMethod = (data ?? []).some((s) => s.phone || s.email || s.preferred_contact_method);
  }
  const hasActiveSeller = active.length > 0;
  const hasDecisionMaker = active.some((l) => l.is_decision_maker);
  const hasSigner = active.some((l) => l.can_sign);
  const reasons: string[] = [];
  if (!hasActiveSeller) reasons.push("אין מוכר מקושר פעיל");
  if (!hasDecisionMaker && !hasSigner) reasons.push("לא מוגדר מקבל החלטות / מורשה חתימה");
  if (hasActiveSeller && !hasContactMethod) reasons.push("חסר אמצעי יצירת קשר למוכר");
  return {
    ready: hasActiveSeller && (hasDecisionMaker || hasSigner) && hasContactMethod,
    hasActiveSeller, hasDecisionMaker, hasSigner, hasContactMethod, reasons,
  };
}
