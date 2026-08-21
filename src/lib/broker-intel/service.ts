// ============================================================================
// ZONO — Broker Intelligence COCKPIT · server aggregation (server-only).
// ----------------------------------------------------------------------------
// The ONE selector for the rebuilt /broker-intelligence. Reads ONLY real,
// org-scoped (RLS) OBSERVED market evidence — the external listings with their
// broker-detection (detected_broker_name + geography + property type + first
// seen) — ONCE, bounded, and hands it to the pure `buildBrokerCockpit`. Only a
// compact model + the detail for the shown brokers reaches the client (never the
// raw listing rows). Uses the observed evidence, NOT the broken broker_profiles
// listings_count (which is never maintained). No private CRM data.
// ============================================================================
import "server-only";
import { externalListingRepository } from "@/lib/external-listings/repository";
import { buildBrokerCockpit, aggregateBrokers, type BrokerCockpit, type BrokerListing, type BrokerFilters, type BrokerAgg } from "./cockpit";

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ms = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };

export interface BrokerCockpitBundle {
  cockpit: BrokerCockpit;
  detail: Record<string, BrokerAgg>;   // aggregate for each broker shown (landscape + directory) → drawer
}

export async function getBrokerCockpit(filters: BrokerFilters): Promise<BrokerCockpitBundle> {
  const now = Date.now();
  let listings: BrokerListing[] = [];
  try {
    const rows = await externalListingRepository.listForOrg();
    listings = rows.map((r) => ({
      id: r.id,
      broker: r.detected_broker_name ?? null,
      hasAgent: r.has_agent ?? null,
      neighborhood: r.neighborhood ?? null,
      city: r.city ?? null,
      propertyType: r.property_type ?? null,
      price: num(r.price),
      firstSeenMs: ms(r.first_seen_at) ?? ms(r.imported_at),
      lat: num((r as { lat?: unknown }).lat), lng: num((r as { lng?: unknown }).lng),
    }));
  } catch (e) { console.error("[broker-cockpit] listings failed:", e instanceof Error ? e.message : e); }

  const cockpit = buildBrokerCockpit({ listings, filters, nowMs: now });

  // Detail (for the in-place drawer) only for the brokers actually shown.
  const cityScoped = filters.city ? listings.filter((l) => (l.city ?? "").trim() === filters.city) : listings;
  const aggMap = aggregateBrokers(cityScoped, now, filters.period);
  const names = new Set<string>([...cockpit.landscape.map((r) => r.name), ...cockpit.directory.rows.map((r) => r.name)]);
  const detail: Record<string, BrokerAgg> = {};
  for (const n of names) { const a = aggMap.get(n); if (a) detail[n] = a; }
  return { cockpit, detail };
}
