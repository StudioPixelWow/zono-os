// ============================================================================
// Broker Competitive Intelligence™ — MAI-8 repository (server-only).
//
// Pure data access: batch-reads broker-attributed listing evidence for one org
// (external_listings attribution + lifecycle state/DOM/price/last-scan +
// acceptance classification + signal-derived price reduction) and joins it into
// per-listing records the engine groups by segment × window × broker. No
// competitive math here — that lives in engine.ts (pure). Service-role scoped.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";
import type { CompetitiveRecord } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;
const key = (provider: string, externalId: string) => `${provider} ${externalId}`;
const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Broker-attributed per-listing records (only listings with a detected broker). */
export async function gatherCompetitiveRecords(organizationId: string): Promise<CompetitiveRecord[]> {
  const db = createServiceRoleClient() as Db;

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
  if (!ext.length) return [];

  const lc = new Map<string, { state: ListingLifecycleState | null; dom: number | null; price: number | null; city: string | null; neighborhood: string | null; lastScanAt: string | null }>();
  {
    const { data } = await db
      .from("market_listing_lifecycle" as never)
      .select("provider,external_id,current_state,days_on_market,last_known_price,last_known_city,last_known_neighborhood,last_scan_at")
      .eq("organization_id", organizationId)
      .limit(40000);
    for (const r of (data ?? []) as unknown as { provider: string; external_id: string; current_state: string | null; days_on_market: number | null; last_known_price: number | null; last_known_city: string | null; last_known_neighborhood: string | null; last_scan_at: string | null }[]) {
      lc.set(key(r.provider, r.external_id), {
        state: (r.current_state ?? null) as ListingLifecycleState | null,
        dom: r.days_on_market, price: r.last_known_price,
        city: r.last_known_city, neighborhood: r.last_known_neighborhood, lastScanAt: r.last_scan_at,
      });
    }
  }

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
      red.set(key(r.provider, r.external_id), avgRed != null && avgRed > 0 && lastPrice != null && lastPrice > 0 ? avgRed / (lastPrice + avgRed) : null);
    }
  }

  const out: CompetitiveRecord[] = [];
  for (const r of ext) {
    if (!r.detected_broker_id) continue;
    const k = key(r.source, r.source_id);
    const life = lc.get(k);
    const s = score.get(k);
    out.push({
      brokerId: r.detected_broker_id,
      provider: r.source, externalId: r.source_id,
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
      lastScanAt: life?.lastScanAt ?? null,
    });
  }
  return out;
}

/** Upsert computed competitive rows (conflict-keyed by broker + segment + window). */
export async function upsertCompetitiveRows(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const db = createServiceRoleClient() as Db;
  for (let i = 0; i < rows.length; i += 500) {
    try {
      await db
        .from("broker_competitive_intelligence" as never)
        .upsert(rows.slice(i, i + 500) as never, { onConflict: "organization_id,broker_id,city,neighborhood,property_type,rooms,price_bucket,window_days" });
    } catch { /* best-effort — retried on the next sync */ }
  }
}
