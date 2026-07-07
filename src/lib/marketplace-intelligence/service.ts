// ============================================================================
// 🛒 ZONO — Marketplace Intelligence — service (server-only). PHASE 58.0.
// Reads ALREADY-IMPORTED external_listings (no scraping) + internal buyers, then
// composes acquisition + buyer-match opportunities, price anomalies and market
// health. REUSES the existing external-listings buyer matcher (deal.ts). Internal
// routing first; the external URL is only ever a secondary link. Org-scoped (RLS);
// compute-cache. Broker alerts stay approval-gated (existing alert-actions).
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import type { Json } from "@/lib/supabase/types";
import { matchBuyersToListing, type BuyerForMatch, type ListingForDeal } from "@/lib/external-listings/deal";
import { detectDuplicate, priceAnomaly, classifyOpportunity, marketHealthByArea } from "./classify";
import { SOURCE_REGISTRY, sourceInfo } from "./registry";
import { MARKETPLACE_INTEL_VERSION, COMPLIANCE_NOTE } from "./types";
import type { MarketListing, MarketplaceReport, MarketOpportunity, SourceInfo } from "./types";

type Rec = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toListing(r: Rec): MarketListing {
  return {
    id: String(r.id), source: s(r.source) ?? "unknown", city: s(r.city), neighborhood: s(r.neighborhood), address: s(r.address),
    propertyType: s(r.property_type), price: num(r.price), rooms: num(r.rooms), sqm: num(r.sqm) ?? num(r.area_sqm),
    listingUrl: s(r.listing_url), status: s(r.status) ?? "active", opportunityScore: num(r.opportunity_score) ?? 0,
    duplicateGroupId: s(r.duplicate_group_id), primaryPropertyId: s(r.primary_property_id), promotedPropertyId: s(r.promoted_property_id),
    listingSourceType: s(r.listing_source_type) ?? "unknown", firstSeenAt: s(r.first_seen_at),
  };
}

function toBuyer(r: Rec): BuyerForMatch {
  return {
    id: String(r.id), name: s(r.full_name) ?? s(r.name) ?? "קונה",
    budgetMin: num(r.budget_min) ?? num(r.min_budget), budgetMax: num(r.budget_max) ?? num(r.max_budget) ?? num(r.budget),
    roomsMin: num(r.rooms_min) ?? num(r.min_rooms), roomsMax: num(r.rooms_max) ?? num(r.max_rooms) ?? num(r.rooms),
    areas: arr(r.preferred_areas).length ? arr(r.preferred_areas) : arr(r.areas).length ? arr(r.areas) : [s(r.preferred_city), s(r.city)].filter((x): x is string => !!x),
    readiness: num(r.readiness_score) ?? num(r.readiness), hasPreapproval: r.has_preapproval === true || r.preapproved === true,
    conversionProbability: num(r.conversion_probability),
  };
}

export async function getMarketplaceIntel(): Promise<MarketplaceReport> {
  const { profile, organization } = await getSessionContext();
  const orgId = profile?.org_id ?? organization?.id ?? null;
  if (orgId) {
    const hit = await getCache<MarketplaceReport>(orgId, "marketplace_intel", []).catch(() => null);
    if (hit) return hit.value;
  }

  const supabase = await createClient();
  const [listRes, buyerRes] = await Promise.all([
    supabase.from("external_listings").select("id,source,city,neighborhood,address,property_type,price,rooms,sqm,area_sqm,listing_url,status,opportunity_score,duplicate_group_id,primary_property_id,promoted_property_id,listing_source_type,first_seen_at").eq("status", "active").order("opportunity_score", { ascending: false }).limit(400),
    supabase.from("buyers").select("*").limit(400).then((r) => r, () => ({ data: [] as unknown[] })),
  ]);

  const listings = ((listRes.data ?? []) as unknown as Rec[]).map(toListing);
  const buyers = ((buyerRes.data ?? []) as unknown as Rec[]).map(toBuyer);

  if (!listings.length) {
    const empty: MarketplaceReport = {
      version: MARKETPLACE_INTEL_VERSION, generatedAt: new Date().toISOString(), sources: SOURCE_REGISTRY,
      opportunities: [], areaHealth: [], totals: { listings: 0, acquisitions: 0, buyerMatches: 0, duplicates: 0, anomalies: 0 },
      hasData: false, notes: ["אין עדיין ליסטינגים חיצוניים מיובאים. ייבוא מתבצע דרך הזרימה הקיימת בלבד — ללא גרידה.", COMPLIANCE_NOTE],
    };
    return empty;
  }

  // Area medians (per-sqm) reused for price-anomaly comparisons.
  const areaHealth = marketHealthByArea(listings);
  const medianByArea = new Map(areaHealth.map((a) => [a.area, a.medianPerSqm]));
  const groupCounts = new Map<string, number>();
  for (const l of listings) if (l.duplicateGroupId) groupCounts.set(l.duplicateGroupId, (groupCounts.get(l.duplicateGroupId) ?? 0) + 1);

  const opportunities: MarketOpportunity[] = [];
  let duplicates = 0, anomalies = 0;
  // Only match buyers for the strongest candidates (bounded work).
  const candidates = listings.slice(0, 120);
  for (const l of candidates) {
    const dup = detectDuplicate(l, groupCounts);
    if (dup.kind !== "unique") duplicates++;
    const anomaly = priceAnomaly(l, medianByArea.get(l.city ?? "לא ידוע") ?? null);
    if (anomaly.isOpportunity) anomalies++;
    const forDeal: ListingForDeal = { id: l.id, title: l.address, city: l.city, neighborhood: l.neighborhood, price: l.price, sqm: l.sqm, rooms: l.rooms, hasAgent: /broker|agent/i.test(l.listingSourceType), opportunityScore: l.opportunityScore };
    const buyerMatches = buyers.length ? matchBuyersToListing(forDeal, buyers).length : 0;
    const op = classifyOpportunity(l, dup, anomaly, buyerMatches);
    if (op) opportunities.push(op);
  }
  opportunities.sort((a, b) => b.score - a.score);

  // Sources actually present + the compliance registry (union).
  const presentKeys = new Set(listings.map((l) => sourceInfo(l.source).key));
  const sources: SourceInfo[] = SOURCE_REGISTRY.map((r) => ({ ...r })).concat(
    [...presentKeys].filter((k) => !SOURCE_REGISTRY.some((r) => r.key === k)).map((k) => sourceInfo(k)),
  );

  const report: MarketplaceReport = {
    version: MARKETPLACE_INTEL_VERSION, generatedAt: new Date().toISOString(), sources,
    opportunities: opportunities.slice(0, 60), areaHealth,
    totals: {
      listings: listings.length,
      acquisitions: opportunities.filter((o) => o.kind === "acquisition").length,
      buyerMatches: opportunities.filter((o) => o.kind === "buyer_match").length,
      duplicates, anomalies,
    },
    hasData: true, notes: [COMPLIANCE_NOTE],
  };

  if (orgId) await setCache(orgId, "marketplace_intel", [], report as unknown as Json, { ttlSeconds: 600, version: MARKETPLACE_INTEL_VERSION }).catch(() => {});
  return report;
}
