// ============================================================================
// ZONO — Market Intelligence COCKPIT · server aggregation (server-only).
// ----------------------------------------------------------------------------
// The ONE canonical selector for the "מרכז מודיעין שוק" cockpit. Reads ONLY real,
// org-scoped (RLS) external-market data — active external listings (with geocode),
// the price-change event stream (with old→new values), and the daily market
// snapshots — ONCE, and hands them to the pure `buildMarketCockpit` derivations
// which apply the filter scope + compute every module server-side. Only a compact
// model reaches the client (no thousands of raw rows). Every read is best-effort:
// a failure degrades to empty, never a fabricated number.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { externalListingRepository } from "@/lib/external-listings/repository";
import {
  buildMarketCockpit, type MarketCockpit, type MiListing, type MiSnapshot,
  type PriceEvent, type CockpitFilters,
} from "./command-center";

const DAY = 86_400_000;

function firstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const f = images[0];
  if (typeof f === "string") return f;
  if (f && typeof f === "object") { const o = f as Record<string, unknown>; return (o.url as string) ?? (o.src as string) ?? (o.image as string) ?? null; }
  return null;
}
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ms = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };

/** Assemble the market-intelligence cockpit for the given filter scope. */
export async function getMarketCockpit(filters: CockpitFilters): Promise<MarketCockpit> {
  const now = Date.now();
  const supabase = await createClient();

  let listings: MiListing[] = [];
  try {
    const rows = await externalListingRepository.listForOrg();
    listings = rows.map((r) => ({
      id: r.id, title: r.title ?? null, city: r.city ?? null, neighborhood: r.neighborhood ?? null,
      propertyType: r.property_type ?? null, dealType: r.deal_type ?? null, price: num(r.price),
      sqm: num(r.sqm) ?? num(r.area_sqm), rooms: num(r.rooms), hasAgent: r.has_agent ?? null,
      contactPhone: r.contact_phone ?? null, opportunityScore: num(r.opportunity_score), status: r.status ?? null,
      firstSeenMs: ms(r.first_seen_at) ?? ms(r.imported_at), image: firstImageUrl(r.images), source: r.source ?? null,
      // lat/lng exist in the DB but may be absent from the generated types.
      lat: num((r as { lat?: unknown }).lat), lng: num((r as { lng?: unknown }).lng),
    }));
  } catch (e) { console.error("[market-cockpit] listings failed:", e instanceof Error ? e.message : e); }

  let priceEvents: PriceEvent[] = [];
  try {
    const since = new Date(now - 90 * DAY).toISOString();
    const { data } = await supabase
      .from("external_listing_history")
      .select("listing_id,created_at,old_value,new_value")
      .eq("change_type", "price_changed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    priceEvents = ((data ?? []) as { listing_id: string | null; created_at: string | null; old_value: unknown; new_value: unknown }[])
      .filter((r) => r.listing_id && r.created_at)
      .map((r) => ({
        tsMs: ms(r.created_at) as number, listingId: r.listing_id as string,
        oldPrice: num((r.old_value as Record<string, unknown> | null)?.price), newPrice: num((r.new_value as Record<string, unknown> | null)?.price),
      }))
      .filter((e) => Number.isFinite(e.tsMs));
  } catch (e) { console.error("[market-cockpit] history failed:", e instanceof Error ? e.message : e); }

  let snapshots: MiSnapshot[] = [];
  try {
    const { data } = await supabase
      .from("market_area_snapshots")
      .select("date,locality_name,avg_price_per_sqm")
      .order("date", { ascending: true })
      .limit(2000);
    snapshots = ((data ?? []) as { date: string; locality_name: string | null; avg_price_per_sqm: number | null }[])
      .map((s) => ({ date: s.date, localityName: s.locality_name, avgPricePerSqm: num(s.avg_price_per_sqm) }));
  } catch (e) { console.error("[market-cockpit] snapshots failed:", e instanceof Error ? e.message : e); }

  return buildMarketCockpit({ listings, priceEvents, snapshots, filters, nowMs: now });
}
