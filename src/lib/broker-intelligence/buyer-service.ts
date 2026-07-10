// ============================================================================
// 🧭 ZONO — BROKER INTELLIGENCE · Area 2 · Buyer service (server-only).
// Feeds the pure buyer engine with REAL persisted data in ONE batch pass:
//   • buyers                       — row signals (financing, budget, temp, recency)
//   • buyer_intelligence_profiles  — readiness/engagement/conversion/days-since-activity
//   • match_intelligence_profiles  — open matches + top closing probability
// No parallel matching/timeline service is created — these are the existing
// persisted intelligence tables. Ranks by business impact. Never throws.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rankBuyers, type BuyerSignals } from "./buyer";
import type { Recommendation } from "./types";

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY));
};

export interface BuyerIntelligence {
  recommendations: Recommendation[];
  scanned: number;
  actionable: number;
  generatedAt: string;
}

/** Rank the buyers who need attention today, from real signals. */
export async function getBuyerIntelligence(limit = 12): Promise<BuyerIntelligence> {
  const empty: BuyerIntelligence = { recommendations: [], scanned: 0, actionable: 0, generatedAt: new Date().toISOString() };
  try {
    const db = await createClient();
    const [buyersRes, intelRes, matchRes] = await Promise.all([
      db.from("buyers").select("id,full_name,temperature,budget_min,budget_max,has_preapproval,last_contacted_at").limit(500),
      db.from("buyer_intelligence_profiles").select("buyer_id,buyer_readiness_score,buyer_engagement_score,buyer_conversion_probability,days_since_activity").limit(500),
      db.from("match_intelligence_profiles").select("buyer_id,property_id,closing_probability,match_stage").limit(4000),
    ]);
    const buyers = buyersRes.data ?? [];
    if (!buyers.length) return empty;

    const intel = new Map((intelRes.data ?? []).map((r) => [r.buyer_id, r]));

    // Group matches per buyer: count OPEN ones + best closing probability.
    const matchAgg = new Map<string, { open: number; topProb: number; topProp: string | null }>();
    for (const m of matchRes.data ?? []) {
      const stage = (m.match_stage ?? "") as string;
      if (stage === "closed" || stage === "lost" || stage === "rejected") continue;
      const cur = matchAgg.get(m.buyer_id) ?? { open: 0, topProb: 0, topProp: null };
      cur.open += 1;
      const prob = (m.closing_probability as number | null) ?? 0;
      if (prob > cur.topProb) { cur.topProb = prob; cur.topProp = m.property_id as string; }
      matchAgg.set(m.buyer_id, cur);
    }

    const signals: BuyerSignals[] = buyers.map((b) => {
      const i = intel.get(b.id);
      const mm = matchAgg.get(b.id);
      return {
        buyerId: b.id,
        name: b.full_name ?? "קונה",
        hasPreapproval: b.has_preapproval === true,
        budgetComplete: b.budget_min != null && b.budget_max != null,
        temperature: (b.temperature as BuyerSignals["temperature"]) ?? null,
        lastContactedDays: daysSince(b.last_contacted_at),
        readinessScore: (i?.buyer_readiness_score as number | null) ?? null,
        engagementScore: (i?.buyer_engagement_score as number | null) ?? null,
        conversionProbability: (i?.buyer_conversion_probability as number | null) ?? null,
        daysSinceActivity: (i?.days_since_activity as number | null) ?? null,
        openMatches: mm?.open ?? 0,
        topMatchProbability: mm ? Math.round(mm.topProb) : null,
        topMatchPropertyId: mm?.topProp ?? null,
      };
    });

    const ranked = rankBuyers(signals);
    const actionable = ranked.filter((r) => !r.insufficientEvidence).length;
    return { recommendations: ranked.slice(0, limit), scanned: buyers.length, actionable, generatedAt: new Date().toISOString() };
  } catch (e) {
    console.error("[broker-intelligence] buyer failed:", e);
    return empty;
  }
}
