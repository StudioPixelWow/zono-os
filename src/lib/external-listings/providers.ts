/**
 * External listing providers — provider-agnostic interface + Yad2/Madlan
 * adapters. Core logic consumes NormalizedExternalListing only.
 *
 * MOCK-SAFE: providers return deterministic mock data. Real Apify actor calls
 * are NOT made here yet (see env vars below for the planned wiring).
 *
 * Planned env:
 *   APIFY_API_TOKEN, APIFY_YAD2_ACTOR_ID (swerve/yad2-scraper),
 *   APIFY_MADLAN_ACTOR_ID (swerve/madlan-scraper)
 */

export interface NormalizedExternalListing {
  source: string;
  sourceId: string;
  externalId?: string | null;
  title?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  address?: string | null;
  propertyType?: string | null;
  dealType?: string | null;
  price?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  balconies?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  sqm?: number | null;
  areaSqm?: number | null;
  lotSize?: number | null;
  parking?: boolean | null;
  storage?: boolean | null;
  elevator?: boolean | null;
  accessibility?: boolean | null;
  secureRoom?: boolean | null;
  condition?: string | null;
  description?: string | null;
  images?: string[];
  floorplanImages?: string[];
  contactName?: string | null;
  contactPhone?: string | null;
  contactType?: string | null;
  hasAgent?: boolean | null;
  listingUrl?: string | null;
  publishedAt?: string | null;
}

export interface ListingSearchParams {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  rooms?: number;
  limit?: number;
}

type RawListing = Record<string, unknown>;

export interface PropertyProvider {
  readonly source: string;
  searchListings(params: ListingSearchParams): Promise<RawListing[]>;
  normalizeListing(raw: RawListing): NormalizedExternalListing;
  getListingDetails(sourceId: string): Promise<RawListing | null>;
  detectRemovedListings(currentSourceIds: string[]): Promise<string[]>;
}

// ── Deterministic mock generator ─────────────────────────────────────────────
const CITIES = ["תל אביב", "חיפה", "ירושלים", "רמת גן", "באר שבע"];
const TYPES = ["apartment", "garden_apartment", "penthouse", "private_house"];

function mockRaws(source: string, params: ListingSearchParams): RawListing[] {
  const n = Math.min(params.limit ?? 8, 12);
  return Array.from({ length: n }, (_, i) => ({
    id: `${source.toUpperCase()}-${1000 + i}`,
    title: `${source === "yad2" ? "דירה למכירה" : "נכס"} ${params.city ?? CITIES[i % CITIES.length]}`,
    city: params.city ?? CITIES[i % CITIES.length],
    type: TYPES[i % TYPES.length],
    price: 1_500_000 + i * 250_000,
    rooms: 3 + (i % 3),
    sqm: 70 + i * 8,
    floor: 1 + (i % 6),
    elevator: i % 2 === 0,
    parking: i % 3 === 0,
    url: `https://www.${source}.co.il/item/${1000 + i}`,
    phone: `05${i}-000000${i}`,
    hasAgent: i % 2 === 0,
  }));
}

class MockProvider implements PropertyProvider {
  constructor(public readonly source: string) {}
  async searchListings(params: ListingSearchParams): Promise<RawListing[]> {
    return mockRaws(this.source, params);
  }
  normalizeListing(raw: RawListing): NormalizedExternalListing {
    return {
      source: this.source,
      sourceId: String(raw.id),
      externalId: String(raw.id),
      title: (raw.title as string) ?? null,
      city: (raw.city as string) ?? null,
      propertyType: (raw.type as string) ?? null,
      dealType: "sale",
      price: (raw.price as number) ?? null,
      rooms: (raw.rooms as number) ?? null,
      sqm: (raw.sqm as number) ?? null,
      floor: (raw.floor as number) ?? null,
      elevator: (raw.elevator as boolean) ?? null,
      parking: (raw.parking as boolean) ?? null,
      contactPhone: (raw.phone as string) ?? null,
      hasAgent: (raw.hasAgent as boolean) ?? null,
      listingUrl: (raw.url as string) ?? null,
      publishedAt: new Date().toISOString(),
      images: [],
    };
  }
  async getListingDetails(sourceId: string): Promise<RawListing | null> {
    return { id: sourceId, title: "פרטי נכס (mock)", city: CITIES[0], type: "apartment", price: 2_000_000 };
  }
  async detectRemovedListings(): Promise<string[]> {
    // Real implementation will diff current vs previously-seen source ids.
    return [];
  }
}

export class Yad2Provider extends MockProvider {
  constructor() {
    super("yad2");
  }
}
export class MadlanProvider extends MockProvider {
  constructor() {
    super("madlan");
  }
}

export function getProvider(source: string): PropertyProvider {
  if (source === "madlan") return new MadlanProvider();
  return new Yad2Provider();
}
