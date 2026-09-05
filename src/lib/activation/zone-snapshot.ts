// ============================================================================
// ZONO — ZONE SNAPSHOT (server-only, READ-ONLY). The "WOW" intelligence a brand-
// new office sees on first login: what ZONO ALREADY knows about the city it chose,
// assembled ONLY from real, existing sources — never fabricated.
//
//   • listings + no-broker + neighborhoods + map points → getCityDiscovery (org)
//   • brokers / offices in the city                     → getCityBrokerageCensus (shared, city-keyed)
//   • sample "no broker" opportunities                  → listPrivateOwnerListings (org)
//   • AI insights                                       → deterministic, derived
//     strictly from the counts above (no LLM, no hallucination)
//
// Every building block already degrades safely (returns 0 / empty when a city
// has no data yet). Any metric with no real source is simply omitted — the UI
// shows an honest "still scanning / not yet" state instead of a made-up number.
// ============================================================================
import "server-only";
import { getCityBrokerageCensus } from "@/lib/brokerage-data/brokerage-knowledge";
import { externalListingRepository } from "@/lib/external-listings/repository";
import type { CityDiscovery } from "./activation";

export interface ZonePrivateListing {
  neighborhood: string | null;
  price: number | null;
  rooms: number | null;
  sqm: number | null;
  propertyType: string | null;
}

export interface ZoneCensus {
  verifiedOffices: number;
  estimatedActiveOffices: number;
  brokersTotal: number;
  listingsTotal: number;
  knowledgeStateLabel: string;
  topOffices: { name: string; brand: string | null; brokerCount: number }[];
}

export interface ZoneSnapshot {
  /** Real brokerage census for the city (shared market data), or null when unknown. */
  census: ZoneCensus | null;
  /** A few real "no broker" listings (opportunities), empty when none discovered. */
  privateOwners: ZonePrivateListing[];
  /** Evidence-based one-liners derived from the real counts above. */
  insights: string[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Compose the real zone snapshot for the office's city. Never throws — each
 * source is independently guarded so a single slow/empty source never blocks
 * the first-login reveal.
 */
export async function getZoneSnapshot(
  orgId: string,
  city: string | null,
  discovery: CityDiscovery,
): Promise<ZoneSnapshot> {
  const [censusRaw, privatesRaw] = await Promise.all([
    city ? getCityBrokerageCensus(orgId, city).catch(() => null) : Promise.resolve(null),
    city ? externalListingRepository.listPrivateOwnerListings(4, city).catch(() => []) : Promise.resolve([]),
  ]);

  const census: ZoneCensus | null =
    censusRaw && (censusRaw.brokersTotal > 0 || censusRaw.verifiedOffices > 0 || censusRaw.listingsTotal > 0)
      ? {
          verifiedOffices: censusRaw.verifiedOffices,
          estimatedActiveOffices: censusRaw.estimatedActiveOffices,
          brokersTotal: censusRaw.brokersTotal,
          listingsTotal: censusRaw.listingsTotal,
          knowledgeStateLabel: censusRaw.knowledgeStateLabel,
          topOffices: censusRaw.offices.slice(0, 4).map((o) => ({
            name: o.name,
            brand: o.brand,
            brokerCount: o.brokerCount,
          })),
        }
      : null;

  const privateOwners: ZonePrivateListing[] = (privatesRaw ?? []).slice(0, 4).map((l) => ({
    neighborhood: (l.neighborhood as string | null) ?? null,
    price: num(l.price),
    rooms: num(l.rooms),
    sqm: num(l.sqm ?? l.area_sqm),
    propertyType: (l.property_type as string | null) ?? null,
  }));

  const insights = buildZoneInsights(discovery, census, city);

  return { census, privateOwners, insights };
}

/** Deterministic, evidence-based insights — every sentence is backed by a real
 *  count from the snapshot. Never asserts anything the data does not show. */
function buildZoneInsights(discovery: CityDiscovery, census: ZoneCensus | null, city: string | null): string[] {
  const where = city ? `ב${city}` : "באזור שלך";
  const out: string[] = [];

  if (discovery.noBrokerCount > 0) {
    out.push(`מצאנו ${discovery.noBrokerCount} נכסים ${where} שאינם משויכים כרגע למתווך — הזדמנות לפנייה ישירה.`);
  }
  if (census && census.brokersTotal > 0) {
    const offices = census.verifiedOffices > 0 ? ` ו‑${census.verifiedOffices} משרדים מאומתים` : "";
    out.push(`זיהינו ${census.brokersTotal} מתווכים${offices} פעילים ${where}.`);
  }
  if (discovery.neighborhoods > 0) {
    out.push(`מיפינו ${discovery.neighborhoods} שכונות ${where} — הבסיס למודיעין השוק שלך.`);
  }
  if (discovery.discoveredListings > 0) {
    const onMap = discovery.mapPoints > 0 ? ` (${discovery.mapPoints} כבר על המפה)` : "";
    out.push(`${discovery.discoveredListings} נכסים כבר במעקב ${where}${onMap}.`);
  }

  if (out.length === 0) {
    out.push(`מתחילים לבנות את מודיעין השוק של ${city ?? "האזור שלך"} — הנתונים ייטענו אוטומטית ויופיעו כאן.`);
  }
  return out.slice(0, 3);
}
