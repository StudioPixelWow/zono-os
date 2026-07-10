// ============================================================================
// 🛡️ ZONO — BROKER INTELLIGENCE · Area 3 · Seller service (server-only).
// Feeds the pure seller engine with REAL persisted data in ONE batch pass:
//   • sellers                        — agreement/marketing flags
//   • seller_intelligence_profiles   — churn/trust/satisfaction/engagement/gap
//   • property_sellers               — seller → primary property link (canonical)
//   • property_intelligence_profiles — momentum/exposure/market-position/marketing
// Reuses the existing intelligence tables — no parallel engine. Never throws.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rankSellers, type SellerSignals } from "./seller";
import type { Recommendation } from "./types";

export interface SellerIntelligence {
  recommendations: Recommendation[];
  scanned: number;
  actionable: number;
  generatedAt: string;
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export async function getSellerIntelligence(limit = 12): Promise<SellerIntelligence> {
  const empty: SellerIntelligence = { recommendations: [], scanned: 0, actionable: 0, generatedAt: new Date().toISOString() };
  try {
    const db = await createClient();
    const [sellersRes, intelRes, linkRes] = await Promise.all([
      db.from("sellers").select("id,full_name,has_signed_agreement,allows_marketing").limit(500),
      db.from("seller_intelligence_profiles").select("seller_id,seller_churn_risk_score,seller_trust_score,seller_satisfaction_score,seller_engagement_score,days_since_last_contact").limit(500),
      db.from("property_sellers").select("seller_id,property_id,is_primary,status").eq("status", "active").limit(1000),
    ]);
    const sellers = sellersRes.data ?? [];
    if (!sellers.length) return empty;

    const intel = new Map((intelRes.data ?? []).map((r) => [r.seller_id, r]));

    // Primary property per seller (is_primary wins; else first active link).
    const primaryProp = new Map<string, string>();
    for (const l of linkRes.data ?? []) {
      if (!primaryProp.has(l.seller_id) || l.is_primary) primaryProp.set(l.seller_id, l.property_id as string);
    }
    const propIds = [...new Set([...primaryProp.values()])];

    let propIntel = new Map<string, Record<string, unknown>>();
    if (propIds.length) {
      const { data } = await db
        .from("property_intelligence_profiles")
        .select("property_id,momentum_score,exposure_score,market_position_score,marketing_score")
        .in("property_id", propIds);
      propIntel = new Map((data ?? []).map((r) => [r.property_id as string, r as Record<string, unknown>]));
    }

    const signals: SellerSignals[] = sellers.map((s) => {
      const i = intel.get(s.id);
      const pid = primaryProp.get(s.id) ?? null;
      const p = pid ? propIntel.get(pid) : undefined;
      return {
        sellerId: s.id,
        name: s.full_name ?? "מוכר",
        hasSignedAgreement: s.has_signed_agreement === true,
        allowsMarketing: (s.allows_marketing as boolean | null) ?? null,
        churnRisk: num(i?.seller_churn_risk_score),
        trust: num(i?.seller_trust_score),
        satisfaction: num(i?.seller_satisfaction_score),
        engagement: num(i?.seller_engagement_score),
        daysSinceContact: num(i?.days_since_last_contact),
        propertyId: pid,
        listingMomentum: num(p?.momentum_score),
        listingExposure: num(p?.exposure_score),
        marketPosition: num(p?.market_position_score),
        marketingScore: num(p?.marketing_score),
      };
    });

    const ranked = rankSellers(signals);
    const actionable = ranked.filter((r) => !r.insufficientEvidence).length;
    return { recommendations: ranked.slice(0, limit), scanned: sellers.length, actionable, generatedAt: new Date().toISOString() };
  } catch (e) {
    console.error("[broker-intelligence] seller failed:", e);
    return empty;
  }
}
