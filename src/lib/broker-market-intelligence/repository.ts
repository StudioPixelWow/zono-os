// ============================================================================
// Broker Market Intelligence™ — MAI-6 repository (server-only).
//
// Pure data access: batch-reads every evidence input for one organization
// (broker profiles, broker-attributed external listings, lifecycle, acceptance
// scores, signals) and joins them into per-broker listing records. No metric
// math here — that lives in engine.ts (pure). Service-role + explicit org scope.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";
import type { BrokerListingRecord } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

const key = (provider: string, externalId: string) => `${provider} ${externalId}`;
const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface BrokerLite { id: string; display_name: string | null; primary_city: string | null }

/** All broker profiles for the org (every broker is profiled, even with 0 listings). */
export async function getBrokerProfiles(organizationId: string): Promise<BrokerLite[]> {
  const db = createServiceRoleClient() as Db;
  const { data } = await db
    .from("broker_profiles" as never)
    .select("id,display_name,primary_city")
    .eq("org_id", organizationId)
    .limit(20000);
  return (data ?? []) as unknown as BrokerLite[];
}

/**
 * Gather broker-attributed listing records, grouped by broker_id.
 * Only listings whose external_listings.detected_broker_id is set are attributed
 * to a broker — listings with no broker are ignored safely (never fabricated).
 */
export async function gatherBrokerListingRecords(
  organizationId: string,
): Promise<Map<string, BrokerListingRecord[]>> {
  const db = createServiceRoleClient() as Db;

  // 1) Broker-attributed external listings (driving set).
  const { data: extData } = await db
    .from("external_listings" as never)
    .select("source,source_id,detected_broker_id,property_type,rooms,price,city,neighborhood")
    .eq("org_id", organizationId)
    .not("detected_broker_id", "is", null)
    .limit(40000);
  const ext = (extData ?? []) as unknown as {
    source: string; source_id: string; detected_broker_id: string | null;
    property_type: string | null; rooms: number | null; price: number | null;
    city: string | null; neighborhood: string | null;
  }[];
  if (!ext.length) return new Map();

  // 2) Lifecycle (state + dom + last-known price/city/neighborhood).
  const lc = new Map<string, { state: ListingLifecycleState | null; dom: number | null; price: number | null; city: string | null; neighborhood: string | null }>();
  {
    const { data } = await db
      .from("market_listing_lifecycle" as never)
      .select("provider,external_id,current_state,days_on_market,last_known_price,last_known_city,last_known_neighborhood")
      .eq("organization_id", organizationId)
      .limit(40000);
    for (const r of (data ?? []) as unknown as { provider: string; external_id: string; current_state: string | null; days_on_market: number | null; last_known_price: number | null; last_known_city: string | null; last_known_neighborhood: string | null }[]) {
      lc.set(key(r.provider, r.external_id), {
        state: (r.current_state ?? null) as ListingLifecycleState | null,
        dom: r.days_on_market, price: r.last_known_price,
        city: r.last_known_city, neighborhood: r.last_known_neighborhood,
      });
    }
  }

  // 3) Acceptance scores (classification + per-listing confidence).
  const score = new Map<string, { classification: MarketAcceptanceClassification | null; conf: number }>();
  {
    const { data } = await db
      .from("market_acceptance_scores" as never)
      .select("provider,external_id,classification,market_exit_confidence,market_acceptance_confidence,market_rejection_confidence")
      .eq("organization_id", organizationId)
      .limit(40000);
    for (const s of (data ?? []) as unknown as { provider: string; external_id: string; classification: string | null; market_exit_confidence: number | null; market_acceptance_confidence: number | null; market_rejection_confidence: number | null }[]) {
      const conf = Math.max(s.market_exit_confidence ?? 0, s.market_acceptance_confidence ?? 0, s.market_rejection_confidence ?? 0) / 100;
      score.set(key(s.provider, s.external_id), { classification: (s.classification ?? null) as MarketAcceptanceClassification | null, conf });
    }
  }

  // 4) Signals → price-reduction fraction (same derivation as MAI-4 aggregates).
  const red = new Map<string, number | null>();
  {
    const { data } = await db
      .from("market_listing_signals" as never)
      .select("provider,external_id,signals")
      .eq("organization_id", organizationId)
      .limit(40000);
    for (const r of (data ?? []) as unknown as { provider: string; external_id: string; signals: Record<string, { value?: unknown }> }[]) {
      const avgRed = numOf(r.signals?.AveragePriceReduction?.value);
      const lastPrice = numOf(r.signals?.LastKnownPrice?.value);
      const pct = avgRed != null && avgRed > 0 && lastPrice != null && lastPrice > 0 ? avgRed / (lastPrice + avgRed) : null;
      red.set(key(r.provider, r.external_id), pct);
    }
  }

  // 5) Join into per-broker record arrays.
  const byBroker = new Map<string, BrokerListingRecord[]>();
  for (const r of ext) {
    const brokerId = r.detected_broker_id;
    if (!brokerId) continue; // no broker → ignored safely
    const k = key(r.source, r.source_id);
    const life = lc.get(k);
    const s = score.get(k);
    const rec: BrokerListingRecord = {
      provider: r.source,
      externalId: r.source_id,
      classification: s?.classification ?? null,
      currentState: life?.state ?? null,
      scoreConfidence: s?.conf ?? 0,
      daysOnMarket: life?.dom ?? null,
      lastKnownPrice: life?.price ?? r.price ?? null,
      reductionPct: red.get(k) ?? null,
      city: life?.city ?? r.city ?? null,
      neighborhood: life?.neighborhood ?? r.neighborhood ?? null,
      propertyType: r.property_type ?? null,
      rooms: r.rooms ?? null,
    };
    const arr = byBroker.get(brokerId) ?? [];
    arr.push(rec);
    byBroker.set(brokerId, arr);
  }
  return byBroker;
}

/** Upsert computed broker-intelligence rows (conflict-keyed — no duplicate broker rows). */
export async function upsertBrokerIntelligenceRows(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const db = createServiceRoleClient() as Db;
  for (let i = 0; i < rows.length; i += 500) {
    try {
      await db
        .from("broker_market_intelligence" as never)
        .upsert(rows.slice(i, i + 500) as never, { onConflict: "organization_id,broker_id,model_version" });
    } catch { /* best-effort — retried on the next sync */ }
  }
}
