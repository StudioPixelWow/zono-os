// ============================================================================
// Market Acceptance Intelligence™ — SIGNAL repository (server-only).
//
// Pure data access for the Signal Engine: batch-reads the evidence inputs for
// one organization (lifecycle, events, current listings, duplicates, area
// aggregates, official deals) and upserts the computed signal rows. No signal
// math here — that lives in signals.ts (pure). Service-role + explicit org scope.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createServiceRoleClient>;

export interface LcLite {
  id: string; provider: string; external_id: string; current_state: string;
  first_seen_at: string | null; last_seen_at: string | null; days_on_market: number | null;
  times_seen: number | null; times_disappeared: number | null; times_returned: number | null;
  last_known_price: number | null; last_known_city: string | null; last_known_neighborhood: string | null;
}
export interface EventLite { event_type: string; previous_value: unknown; new_value: unknown }
export interface ExtLite { id: string; provider: string; price: number | null; status: string | null; city: string | null; neighborhood: string | null }

export interface SignalRawData {
  lifecycle: LcLite[];
  eventsByKey: Map<string, EventLite[]>;
  extByKey: Map<string, ExtLite>;   // `${provider} ${external_id}` → live external_listings row
  extById: Map<string, ExtLite>;    // external_listings.id → row
  dupByListingId: Map<string, { confidence: number; partners: string[] }>;
  activeByCity: Map<string, number>;
  activeByNeighborhood: Map<string, number>;
  txnByCity: Map<string, number>;
  transactionsAvailable: boolean;
}

const key = (provider: string, externalId: string) => `${provider} ${externalId}`;
const TXN_WINDOW_DAYS = 180;
const SIGNAL_EVENT_TYPES = ["PRICE_CHANGED", "IMAGE_CHANGED", "DESCRIPTION_CHANGED", "STATUS_CHANGED"];

/** Gather every evidence input for an org's listings in a few bounded reads. */
export async function gatherSignalData(organizationId: string): Promise<SignalRawData> {
  const db = createServiceRoleClient() as Db;

  // 1) Lifecycle rows.
  const { data: lcData } = await db
    .from("market_listing_lifecycle" as never)
    .select("id,provider,external_id,current_state,first_seen_at,last_seen_at,days_on_market,times_seen,times_disappeared,times_returned,last_known_price,last_known_city,last_known_neighborhood")
    .eq("organization_id", organizationId)
    .limit(20000);
  const lifecycle = (lcData ?? []) as unknown as LcLite[];

  // 2) Signal-relevant events, grouped per listing key.
  const eventsByKey = new Map<string, EventLite[]>();
  const { data: evData } = await db
    .from("market_listing_events" as never)
    .select("provider,external_id,event_type,previous_value,new_value")
    .eq("organization_id", organizationId)
    .in("event_type", SIGNAL_EVENT_TYPES)
    .limit(80000);
  for (const e of (evData ?? []) as unknown as { provider: string; external_id: string; event_type: string; previous_value: unknown; new_value: unknown }[]) {
    const k = key(e.provider, e.external_id);
    const arr = eventsByKey.get(k) ?? [];
    arr.push({ event_type: e.event_type, previous_value: e.previous_value, new_value: e.new_value });
    eventsByKey.set(k, arr);
  }

  // 3) Live external listings → current price + id maps + area aggregates.
  const extByKey = new Map<string, ExtLite>();
  const extById = new Map<string, ExtLite>();
  const activeByCity = new Map<string, number>();
  const activeByNeighborhood = new Map<string, number>();
  const { data: extData } = await db
    .from("external_listings" as never)
    .select("id,source,source_id,price,status,city,neighborhood")
    .eq("org_id", organizationId)
    .limit(20000);
  for (const r of (extData ?? []) as unknown as { id: string; source: string; source_id: string; price: number | null; status: string | null; city: string | null; neighborhood: string | null }[]) {
    const lite: ExtLite = { id: r.id, provider: r.source, price: r.price, status: r.status, city: r.city, neighborhood: r.neighborhood };
    extByKey.set(key(r.source, r.source_id), lite);
    extById.set(r.id, lite);
    if (r.status === "active") {
      if (r.city) activeByCity.set(r.city, (activeByCity.get(r.city) ?? 0) + 1);
      if (r.neighborhood) activeByNeighborhood.set(r.neighborhood, (activeByNeighborhood.get(r.neighborhood) ?? 0) + 1);
    }
  }

  // 4) Suspected duplicates → confidence + cross-provider partners per listing.
  const dupByListingId = new Map<string, { confidence: number; partners: string[] }>();
  try {
    const { data: dupData } = await db
      .from("external_listing_duplicates" as never)
      .select("listing_id,duplicate_of_listing_id,confidence_score")
      .eq("org_id", organizationId)
      .limit(20000);
    for (const d of (dupData ?? []) as unknown as { listing_id: string; duplicate_of_listing_id: string; confidence_score: number | null }[]) {
      const conf = d.confidence_score ?? 0;
      for (const [self, other] of [[d.listing_id, d.duplicate_of_listing_id], [d.duplicate_of_listing_id, d.listing_id]] as [string, string][]) {
        const entry = dupByListingId.get(self) ?? { confidence: 0, partners: [] };
        entry.confidence = Math.max(entry.confidence, conf);
        if (other && !entry.partners.includes(other)) entry.partners.push(other);
        dupByListingId.set(self, entry);
      }
    }
  } catch { /* duplicates are best-effort context */ }

  // 5) Recent official deals per city (coarse proximity; government data, public).
  const txnByCity = new Map<string, number>();
  let transactionsAvailable = false;
  try {
    const cities = [...new Set(lifecycle.map((l) => l.last_known_city).filter((c): c is string => !!c))];
    if (cities.length) {
      const cutoff = new Date(Date.now() - TXN_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      const { data: txn, error } = await db
        .from("property_transactions" as never)
        .select("city_name")
        .in("city_name", cities)
        .gte("deal_date", cutoff)
        .limit(50000);
      if (!error) {
        transactionsAvailable = true;
        for (const t of (txn ?? []) as unknown as { city_name: string | null }[]) {
          if (t.city_name) txnByCity.set(t.city_name, (txnByCity.get(t.city_name) ?? 0) + 1);
        }
      }
    } else {
      transactionsAvailable = true; // no cities to look up is not a failure
    }
  } catch { /* transactions unavailable → signals reduce confidence, never invent */ }

  return { lifecycle, eventsByKey, extByKey, extById, dupByListingId, activeByCity, activeByNeighborhood, txnByCity, transactionsAvailable };
}

/** Read the previous signal snapshots so the new write can retain them for comparison. */
export async function getPreviousSignals(organizationId: string): Promise<Map<string, unknown>> {
  const db = createServiceRoleClient() as Db;
  const out = new Map<string, unknown>();
  const { data } = await db
    .from("market_listing_signals" as never)
    .select("provider,external_id,signals")
    .eq("organization_id", organizationId)
    .limit(20000);
  for (const r of (data ?? []) as unknown as { provider: string; external_id: string; signals: unknown }[]) {
    out.set(key(r.provider, r.external_id), r.signals);
  }
  return out;
}

/** Upsert computed signal rows (conflict-keyed, no duplicate rows). */
export async function upsertSignalRows(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const db = createServiceRoleClient() as Db;
  for (let i = 0; i < rows.length; i += 500) {
    try { await db.from("market_listing_signals" as never).upsert(rows.slice(i, i + 500) as never, { onConflict: "organization_id,provider,external_id" }); }
    catch { /* best-effort — retried on the next sync */ }
  }
}
