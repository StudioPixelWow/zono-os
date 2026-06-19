/**
 * seller360Service — enriched reads joining sellers, property_sellers, and
 * seller intelligence (server-only).
 */
import { createClient } from "@/lib/supabase/server";
import { propertySellerRepository } from "./propertySellers";
import { getSellerById, type SellerRow } from "./repository";

export interface OwnedProperty {
  linkId: string;
  propertyId: string;
  title: string;
  relationshipType: string;
  ownershipPercentage: number | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  canSign: boolean;
}

export interface Seller360 {
  seller: SellerRow;
  properties: OwnedProperty[];
}

export async function getSeller360(sellerId: string): Promise<Seller360 | null> {
  const seller = await getSellerById(sellerId);
  if (!seller) return null;
  const links = await propertySellerRepository.listForSeller(sellerId);
  const supabase = await createClient();
  const ids = [...new Set(links.map((l) => l.property_id))];
  const titles = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("properties").select("id,title").in("id", ids);
    for (const p of data ?? []) titles.set(p.id, p.title);
  }
  return {
    seller,
    properties: links.map((l) => ({
      linkId: l.id,
      propertyId: l.property_id,
      title: titles.get(l.property_id) ?? "נכס",
      relationshipType: l.relationship_type,
      ownershipPercentage: l.ownership_percentage,
      isPrimary: l.is_primary,
      isDecisionMaker: l.is_decision_maker,
      canSign: l.can_sign,
    })),
  };
}

export interface PropertySellerView {
  linkId: string;
  sellerId: string;
  name: string;
  relationshipType: string;
  ownershipPercentage: number | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  canSign: boolean;
  receivesReports: boolean;
  trustScore: number | null;
  churnRisk: number | null;
}

export async function getPropertySellers(propertyId: string): Promise<PropertySellerView[]> {
  const links = await propertySellerRepository.listForProperty(propertyId);
  if (!links.length) return [];
  const supabase = await createClient();
  const ids = [...new Set(links.map((l) => l.seller_id))];
  const [sellersRes, intelRes] = await Promise.all([
    supabase.from("sellers").select("id,full_name").in("id", ids),
    supabase.from("seller_intelligence_profiles").select("seller_id,seller_trust_score,seller_churn_risk_score").in("seller_id", ids),
  ]);
  const names = new Map((sellersRes.data ?? []).map((s) => [s.id, s.full_name]));
  const intel = new Map((intelRes.data ?? []).map((s) => [s.seller_id, s]));
  return links.map((l) => ({
    linkId: l.id,
    sellerId: l.seller_id,
    name: names.get(l.seller_id) ?? "מוכר",
    relationshipType: l.relationship_type,
    ownershipPercentage: l.ownership_percentage,
    isPrimary: l.is_primary,
    isDecisionMaker: l.is_decision_maker,
    canSign: l.can_sign,
    receivesReports: l.receives_reports,
    trustScore: intel.get(l.seller_id)?.seller_trust_score ?? null,
    churnRisk: intel.get(l.seller_id)?.seller_churn_risk_score ?? null,
  }));
}
