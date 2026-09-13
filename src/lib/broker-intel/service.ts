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
import { localityHe } from "@/lib/geo/locality";

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ms = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };

export interface BrokerCockpitBundle {
  cockpit: BrokerCockpit;
  detail: Record<string, BrokerAgg>;   // aggregate for each broker shown (landscape + directory) → drawer
}

// ── Observed-broker DETAIL (name-keyed) ─────────────────────────────────────
// The arena identifies brokers by observed NAME (there is no canonical id — that
// is identity resolution / ENGINE_REQUIRED). This selector powers the per-broker
// detail page: it re-reads the same org-scoped observed evidence and returns
// everything ZONO observed for ONE broker name — inventory, territory, property
// mix, price band, activity window, and the real listing cards. No CRM, no merge
// of spelling variants (exact normalized-name match, same key the arena groups on).
export interface ObservedBrokerListing {
  id: string; title: string | null; neighborhood: string | null; city: string | null;
  rooms: number | null; sqm: number | null; price: number | null; source: string | null;
  firstSeen: string | null; image: string | null; listingUrl: string | null;
  address: string | null; propertyType: string | null; dealType: string | null;
}
export interface ObservedBrokerDetail {
  name: string;
  observedInventory: number;
  activeListings: number;
  new30d: number;
  neighborhoods: number;
  avgPrice: number | null; medianPrice: number | null; minPrice: number | null; maxPrice: number | null;
  firstObserved: string | null; lastObserved: string | null;
  geocodedPct: number;
  areas: { name: string; count: number }[];
  propertyTypes: { type: string; count: number }[];
  dealTypes: { type: string; count: number }[];
  contactPhones: string[];
  listings: ObservedBrokerListing[];
}

const firstImageOf = (v: unknown): string | null => {
  let arr: unknown = v;
  if (typeof v === "string") { try { arr = JSON.parse(v); } catch { return v.trim() ? v : null; } }
  if (!Array.isArray(arr)) return null;
  for (const it of arr) {
    if (typeof it === "string" && it.trim()) return it;
    if (it && typeof it === "object" && typeof (it as { url?: string }).url === "string") return (it as { url: string }).url;
  }
  return null;
};

export async function getObservedBrokerDetail(nameParam: string): Promise<ObservedBrokerDetail | null> {
  const target = (nameParam ?? "").replace(/\s+/g, " ").trim();
  if (!target) return null;

  let rows: Awaited<ReturnType<typeof externalListingRepository.listForOrg>> = [];
  try { rows = await externalListingRepository.listForOrg(); }
  catch (e) { console.error("[observed-broker] listings failed:", e instanceof Error ? e.message : e); return null; }

  const nameOf = (r: (typeof rows)[number]): string | null => {
    const raw = (r.detected_broker_name ?? (r.has_agent ? r.contact_name : null)) ?? "";
    const v = String(raw).replace(/\s+/g, " ").trim();
    return v.length ? v : null;
  };
  const mine = rows.filter((r) => nameOf(r) === target);
  if (mine.length === 0) return null;

  const count = <T extends string>(items: (T | null)[]): { name: T; count: number }[] => {
    const m = new Map<T, number>();
    for (const it of items) { if (it == null) continue; m.set(it, (m.get(it) ?? 0) + 1); }
    return [...m.entries()].map(([name, c]) => ({ name, count: c })).sort((a, b) => b.count - a.count);
  };

  const prices = mine.map((r) => num(r.price)).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null;
  const seens = mine.map((r) => ms(r.first_seen_at) ?? ms(r.imported_at)).filter((t): t is number => t != null);
  const DAY = 86_400_000; const now = Date.now();
  const geocoded = mine.filter((r) => num((r as { lat?: unknown }).lat) != null).length;
  const phones = [...new Set(mine.map((r) => (r.contact_phone ?? "").toString().trim()).filter((p) => p.length >= 6))].slice(0, 3);

  const listings: ObservedBrokerListing[] = mine
    .slice()
    .sort((a, b) => (num(b.price) ?? 0) - (num(a.price) ?? 0))
    .slice(0, 60)
    .map((r) => ({
      id: r.id,
      title: (r.title as string) ?? null,
      neighborhood: (r.neighborhood as string) ?? null,
      city: localityHe((r.city as string) ?? null),
      rooms: num(r.rooms), sqm: num(r.sqm), price: num(r.price),
      source: (r.source as string) ?? null,
      firstSeen: (r.first_seen_at as string) ?? null,
      image: firstImageOf(r.images),
      listingUrl: (r.listing_url as string) ?? null,
      address: ((r.address as string) || (r.street as string)) ?? null,
      propertyType: (r.property_type as string) ?? null,
      dealType: (r.deal_type as string) ?? null,
    }));

  const areas = count(mine.map((r) => (r.neighborhood as string) || localityHe((r.city as string) ?? null)));
  return {
    name: target,
    observedInventory: mine.length,
    activeListings: mine.filter((r) => (r.status ?? "active") === "active").length,
    new30d: mine.filter((r) => { const t = ms(r.first_seen_at) ?? ms(r.imported_at); return t != null && now - t < 30 * DAY; }).length,
    neighborhoods: areas.length,
    avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
    medianPrice: median, minPrice: prices[0] ?? null, maxPrice: prices[prices.length - 1] ?? null,
    firstObserved: seens.length ? new Date(Math.min(...seens)).toISOString() : null,
    lastObserved: seens.length ? new Date(Math.max(...seens)).toISOString() : null,
    geocodedPct: mine.length ? Math.round((geocoded / mine.length) * 100) : 0,
    areas: areas.slice(0, 8),
    propertyTypes: count(mine.map((r) => (r.property_type as string) ?? null)).slice(0, 6).map((x) => ({ type: x.name, count: x.count })),
    dealTypes: count(mine.map((r) => (r.deal_type as string) ?? null)).slice(0, 4).map((x) => ({ type: x.name, count: x.count })),
    contactPhones: phones,
    listings,
  };
}

export async function getBrokerCockpit(filters: BrokerFilters): Promise<BrokerCockpitBundle> {
  const now = Date.now();
  let listings: BrokerListing[] = [];
  try {
    const rows = await externalListingRepository.listForOrg();
    listings = rows.map((r) => ({
      id: r.id,
      // Fall back to the listing's own contact_name (the real advertiser/agent
      // name) for AGENT listings when broker DETECTION hasn't stamped
      // detected_broker_name yet — otherwise the whole cockpit reads empty even
      // though every agent listing already names its broker. Trim to merge
      // trailing-whitespace variants of the same name.
      broker: ((r.detected_broker_name ?? (r.has_agent ? r.contact_name : null)) ?? "").toString().trim() || null,
      hasAgent: r.has_agent ?? null,
      neighborhood: r.neighborhood ?? null,
      // Hebraise the scraped city so the cockpit label, city filter and area
      // rows all read Hebrew ("Even Yehuda" → "אבן יהודה"); unknown localities
      // are left as written (never a fabricated translation).
      city: localityHe(r.city ?? null),
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
