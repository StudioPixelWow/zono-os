// ============================================================================
// Valuation Weight Engine™ — server-only data access.
// Loads the best-matching Market Acceptance aggregate for a property's segment
// (MAI-4) and upserts the weight result. Read-only over MAI tables; never writes
// to valuation or transaction tables.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { priceBucket } from "@/lib/market-acceptance";
import type { MarketAcceptanceFacts } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

export interface SegmentDims {
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  priceForBucket: number | null;
}

interface AggRow {
  city: string | null; neighborhood: string | null; property_type: string | null; rooms: number | null; price_bucket: string | null;
  sample_size: number | null; confidence: number | null;
  market_acceptance_rate: number | null; market_exit_rate: number | null; market_rejection_rate: number | null;
  median_days_on_market: number | null; absorption_speed_score: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : v == null ? null : Number(v));

/**
 * Find the most-specific 30-day aggregate that CONTAINS this property and pick
 * Market Acceptance facts from it. Falls back to coarser segments; returns
 * `{ present:false }` when nothing matches. Uses the property's price bucket.
 */
export async function getAcceptanceFactsForSegment(organizationId: string, dims: SegmentDims): Promise<MarketAcceptanceFacts> {
  const absent: MarketAcceptanceFacts = { present: false, sampleSize: 0, aggregateConfidence: 0, acceptanceRate: null, exitRate: null, rejectionRate: null, medianDom: null, absorptionSpeed: null };
  if (!dims.city) return absent;
  const bucket = priceBucket(dims.priceForBucket);
  const db = createServiceRoleClient() as Db;

  const { data } = await db
    .from("market_acceptance_aggregates" as never)
    .select("city,neighborhood,property_type,rooms,price_bucket,sample_size,confidence,market_acceptance_rate,market_exit_rate,market_rejection_rate,median_days_on_market,absorption_speed_score")
    .eq("organization_id", organizationId)
    .eq("window_days", 30)
    .eq("city", dims.city)
    .limit(1000);
  const rows = (data ?? []) as unknown as AggRow[];
  if (!rows.length) return absent;

  // A row matches if each of its non-null dims equals the property's dim.
  const matches = rows.filter((r) =>
    (r.neighborhood == null || r.neighborhood === dims.neighborhood) &&
    (r.property_type == null || r.property_type === dims.propertyType) &&
    (r.rooms == null || (dims.rooms != null && Number(r.rooms) === dims.rooms)) &&
    (r.price_bucket == null || r.price_bucket === bucket) &&
    (r.sample_size ?? 0) > 0,
  );
  if (!matches.length) return absent;

  // Specificity = count of non-null dims; prefer most specific, then larger sample.
  const spec = (r: AggRow) => [r.neighborhood, r.property_type, r.rooms, r.price_bucket].filter((x) => x != null).length;
  matches.sort((a, b) => spec(b) - spec(a) || (b.sample_size ?? 0) - (a.sample_size ?? 0));
  const m = matches[0];

  return {
    present: true,
    sampleSize: m.sample_size ?? 0,
    aggregateConfidence: num(m.confidence) ?? 0,
    acceptanceRate: num(m.market_acceptance_rate),
    exitRate: num(m.market_exit_rate),
    rejectionRate: num(m.market_rejection_rate),
    medianDom: num(m.median_days_on_market),
    absorptionSpeed: num(m.absorption_speed_score),
  };
}

/** Upsert one weight result (idempotent per valuation + profile). */
export async function upsertValuationWeightResult(row: Record<string, unknown>): Promise<void> {
  const db = createServiceRoleClient() as Db;
  try {
    await db.from("valuation_weight_results" as never).upsert(row as never, { onConflict: "organization_id,valuation_id,weight_profile" });
  } catch { /* best-effort — never blocks the valuation */ }
}
