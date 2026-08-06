// ============================================================================
// ZONO creative-studio — additive creative kinds (pure definitions + guards).
//
// Extends the existing type system WITHOUT removing or renaming existing kinds.
// Existing (unchanged): property_ad_post, sold_post, testimonial_post.
// Added: agent_brand, office_brand, market_stat.
//
// The market-stat guard enforces that every statistic is SOURCED — the engine
// must never invent a number. Data is supplied by ZONO-native orchestration.
// ============================================================================

export const EXISTING_CREATIVE_KINDS = ["property_ad_post", "sold_post", "testimonial_post"] as const;
export const NEW_CREATIVE_KINDS = ["agent_brand", "office_brand", "market_stat"] as const;
export type CreativeKind = (typeof EXISTING_CREATIVE_KINDS)[number] | (typeof NEW_CREATIVE_KINDS)[number];

export const AGENT_BRAND_SUBTYPES = [
  "introduction", "expertise", "neighborhood_specialist", "testimonial",
  "success_story", "personal_insight", "contact_cta",
] as const;
export type AgentBrandSubtype = (typeof AGENT_BRAND_SUBTYPES)[number];

export const OFFICE_BRAND_SUBTYPES = [
  "introduction", "team_strength", "recruitment", "achievement",
  "market_presence", "community_activity", "branch_announcement", "service_message",
] as const;
export type OfficeBrandSubtype = (typeof OFFICE_BRAND_SUBTYPES)[number];

export const MARKET_STAT_SUBTYPES = [
  "neighborhood_update", "city_update", "price_change", "listing_volume_change",
  "time_on_market", "price_per_sqm", "new_opportunities", "price_anomaly", "period_summary",
] as const;
export type MarketStatSubtype = (typeof MARKET_STAT_SUBTYPES)[number];

export function isNewKind(k: string): k is (typeof NEW_CREATIVE_KINDS)[number] {
  return (NEW_CREATIVE_KINDS as readonly string[]).includes(k);
}
export function isKnownKind(k: string): k is CreativeKind {
  return (EXISTING_CREATIVE_KINDS as readonly string[]).includes(k) || isNewKind(k);
}

/** Which brand assets a kind requires (drives the brand resolver + QA). */
export function requiredAssetsFor(kind: CreativeKind): { agentPhoto: boolean; logo: boolean; property: boolean } {
  switch (kind) {
    case "agent_brand": return { agentPhoto: true, logo: true, property: false };
    case "office_brand": return { agentPhoto: false, logo: true, property: false };
    case "market_stat": return { agentPhoto: false, logo: true, property: false };
    default: return { agentPhoto: false, logo: true, property: true };
  }
}

// ── Market-stat sourcing contract ────────────────────────────────────────────

export interface MarketStat {
  subtype: MarketStatSubtype;
  value: number | string;
  source: string;                 // provenance, e.g. "gov.il transactions" / "internal-index"
  period: string;                 // e.g. "2026-07" / "Q2-2026"
  geography: string;              // city / neighborhood identifier
  freshnessTimestamp: string;     // ISO — when the data was computed
  comparisonBasis: string;        // e.g. "vs previous month", "YoY"
  classification: "factual" | "inferred";
  unit?: string;
}

export interface MarketStatValidation { ok: boolean; missing: string[] }

/** Every stat must be fully sourced. Missing provenance => reject (never invent). */
export function validateMarketStat(s: Partial<MarketStat> | null | undefined): MarketStatValidation {
  const missing: string[] = [];
  const req: (keyof MarketStat)[] = ["subtype", "value", "source", "period", "geography", "freshnessTimestamp", "comparisonBasis", "classification"];
  for (const k of req) {
    const v = s?.[k];
    if (v === undefined || v === null || v === "") missing.push(String(k));
  }
  if (s?.classification && !["factual", "inferred"].includes(s.classification)) missing.push("classification(valid)");
  return { ok: missing.length === 0, missing };
}
