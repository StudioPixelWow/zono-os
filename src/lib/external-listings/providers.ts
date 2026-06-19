/**
 * External listing providers — real Apify-powered Yad2 / Madlan scrapers.
 * SERVER-ONLY: APIFY_TOKEN is read from the environment and never exposed.
 *
 * Env:
 *   APIFY_TOKEN
 *   APIFY_YAD2_ACTOR_ID   (default swerve/yad2-scraper)
 *   APIFY_MADLAN_ACTOR_ID (default swerve/madlan-scraper)
 *
 * If APIFY_TOKEN is missing: in development we fall back to mock data; in
 * production we throw a clear error (no silent empty imports).
 */
import "server-only";
import { ApifyClient } from "apify-client";

export const MAX_LISTINGS_PER_CITY = 50;

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
  parking?: boolean | null;
  elevator?: boolean | null;
  secureRoom?: boolean | null;
  condition?: string | null;
  description?: string | null;
  images?: string[];
  contactName?: string | null;
  contactPhone?: string | null;
  contactType?: string | null;
  hasAgent?: boolean | null;
  listingUrl?: string | null;
  publishedAt?: string | null;
  rawData?: Record<string, unknown>;
}

type RawListing = Record<string, unknown>;

export interface PropertyProvider {
  readonly source: string;
  readonly actorId: string;
  searchListings(locality: string, limit?: number): Promise<RawListing[]>;
  normalizeListing(raw: RawListing): NormalizedExternalListing;
  /** Diagnostic run — never throws, never persists; surfaces status + error. */
  debugRun(city: string, limit: number): Promise<ProviderDebugResult>;
}

/** Result of a non-destructive actor test run (admin debug tool). */
export interface ProviderDebugResult {
  actorId: string;
  runStatus: string;
  datasetItems: number;
  rawSample: RawListing | null;
  error: string | null;
}

const isDev = process.env.NODE_ENV !== "production";
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null ? null : String(v));
const pick = (raw: RawListing, keys: string[]): unknown => {
  for (const k of keys) if (raw[k] != null) return raw[k];
  return null;
};

function client(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN missing");
  // Bounded retries — never hang indefinitely on transient Apify errors.
  return new ApifyClient({ token, maxRetries: 3 });
}

/** Run an Apify actor and return its default dataset items (bounded). */
async function runActor(actorId: string, input: Record<string, unknown>, limit = MAX_LISTINGS_PER_CITY): Promise<RawListing[]> {
  // Guardrails: cap the actor run + wait so a request can't hang indefinitely.
  const run = await client().actor(actorId).call(input, { timeout: 120, waitSecs: 110, memory: 512 });
  if (run.status !== "SUCCEEDED") {
    throw new Error(`actor ${actorId} status=${run.status}`);
  }
  const datasetId = run.defaultDatasetId;
  if (!datasetId) return [];
  const { items } = await client().dataset(datasetId).listItems({ limit });
  return items as RawListing[];
}

// ── Mock fallback (development only) ─────────────────────────────────────────
function mockRaws(source: string, locality: string): RawListing[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `${source.toUpperCase()}-${locality}-${1000 + i}`,
    title: `${source === "yad2" ? "דירה למכירה" : "נכס"} ${locality}`,
    city: locality,
    type: "apartment",
    price: 1_500_000 + i * 250_000,
    rooms: 3 + (i % 3),
    sqm: 70 + i * 8,
    floor: 1 + (i % 5),
    url: `https://www.${source}.co.il/item/${1000 + i}`,
    phone: `05${i}-000000${i}`,
    hasAgent: i % 2 === 0,
    _mock: true,
  }));
}

class ApifyProvider implements PropertyProvider {
  constructor(public readonly source: string, private readonly actorEnv: string, private readonly defaultActor: string) {}

  /** Resolved actor id (env override → default). */
  get actorId(): string {
    return process.env[this.actorEnv] || this.defaultActor;
  }

  /**
   * INPUT ADAPTER — the single place to adapt to a real actor's schema.
   * Defaults send the common Yad2/Madlan-style keys plus location/maxItems
   * aliases. If an actor rejects city/dealType/maxListingsPerCity, edit here
   * (or override in the subclass) to match its actual required fields.
   */
  buildInput(city: string, limit: number): Record<string, unknown> {
    return {
      city,
      locality: city,
      location: city,
      dealType: "sale",
      maxListingsPerCity: limit,
      maxItems: limit,
      maxResults: limit,
    };
  }

  async searchListings(locality: string, limit = MAX_LISTINGS_PER_CITY): Promise<RawListing[]> {
    if (!process.env.APIFY_TOKEN) {
      if (isDev) return mockRaws(this.source, locality);
      throw new Error("APIFY_TOKEN missing — external import unavailable in production");
    }
    return runActor(this.actorId, this.buildInput(locality, limit), limit);
  }

  /** Non-destructive test run: returns status + first item + error, never throws. */
  async debugRun(city: string, limit: number): Promise<ProviderDebugResult> {
    const actorId = this.actorId;
    if (!process.env.APIFY_TOKEN) {
      if (isDev) {
        const items = mockRaws(this.source, city).slice(0, limit);
        return { actorId, runStatus: "MOCK", datasetItems: items.length, rawSample: items[0] ?? null, error: null };
      }
      return { actorId, runStatus: "NO_TOKEN", datasetItems: 0, rawSample: null, error: "APIFY_TOKEN missing" };
    }
    try {
      const run = await client().actor(actorId).call(this.buildInput(city, limit), { timeout: 90, waitSecs: 80, memory: 512 });
      const datasetId = run.defaultDatasetId;
      let items: RawListing[] = [];
      if (datasetId) {
        const res = await client().dataset(datasetId).listItems({ limit });
        items = res.items as RawListing[];
      }
      return {
        actorId,
        runStatus: run.status,
        datasetItems: items.length,
        rawSample: items[0] ?? null,
        error: run.status === "SUCCEEDED" ? null : `actor finished with status=${run.status}`,
      };
    } catch (e) {
      return { actorId, runStatus: "ERROR", datasetItems: 0, rawSample: null, error: e instanceof Error ? e.message : "unknown Apify error" };
    }
  }

  normalizeListing(raw: RawListing): NormalizedExternalListing {
    const images = (() => {
      const v = pick(raw, ["images", "imageUrls", "image_urls", "photos"]);
      if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : (x as { url?: string })?.url ?? "")).filter(Boolean);
      return [] as string[];
    })();
    return {
      source: this.source,
      sourceId: String(pick(raw, ["id", "listingId", "adNumber", "token"]) ?? cryptoId()),
      externalId: str(pick(raw, ["id", "listingId", "adNumber", "token"])),
      title: str(pick(raw, ["title", "name", "headline"])),
      city: str(pick(raw, ["city", "cityName", "locality", "area"])),
      neighborhood: str(pick(raw, ["neighborhood", "neighbourhood", "hood"])),
      street: str(pick(raw, ["street", "streetName"])),
      streetNumber: str(pick(raw, ["streetNumber", "houseNumber", "number"])),
      address: str(pick(raw, ["address", "fullAddress"])),
      propertyType: str(pick(raw, ["type", "propertyType", "category"])),
      dealType: "sale",
      price: num(pick(raw, ["price", "askingPrice", "priceValue"])),
      rooms: num(pick(raw, ["rooms", "roomsCount", "numberOfRooms"])),
      bathrooms: num(pick(raw, ["bathrooms"])),
      balconies: num(pick(raw, ["balconies"])),
      floor: num(pick(raw, ["floor", "floorNumber"])),
      totalFloors: num(pick(raw, ["totalFloors", "floors"])),
      sqm: num(pick(raw, ["sqm", "size", "squareMeters", "area_sqm"])),
      areaSqm: num(pick(raw, ["areaSqm", "builtArea"])),
      parking: typeof pick(raw, ["parking", "hasParking"]) === "boolean" ? Boolean(pick(raw, ["parking", "hasParking"])) : null,
      elevator: typeof pick(raw, ["elevator", "hasElevator"]) === "boolean" ? Boolean(pick(raw, ["elevator", "hasElevator"])) : null,
      condition: str(pick(raw, ["condition", "state"])),
      description: str(pick(raw, ["description", "text", "body"])),
      images,
      contactName: str(pick(raw, ["contactName", "advertiserName", "agentName"])),
      contactPhone: str(pick(raw, ["phone", "contactPhone", "advertiserPhone"])),
      contactType: str(pick(raw, ["contactType", "advertiserType"])),
      hasAgent: typeof pick(raw, ["hasAgent", "isAgent"]) === "boolean" ? Boolean(pick(raw, ["hasAgent", "isAgent"])) : null,
      listingUrl: str(pick(raw, ["url", "link", "listingUrl"])),
      publishedAt: str(pick(raw, ["publishedAt", "date", "createdAt"])),
      rawData: raw,
    };
  }
}

function cryptoId(): string {
  return `gen-${Math.random().toString(36).slice(2, 10)}`;
}

export class Yad2Provider extends ApifyProvider {
  constructor() {
    super("yad2", "APIFY_YAD2_ACTOR_ID", "swerve/yad2-scraper");
  }
  // Yad2 input adapter — adjust keys here to the real Yad2 actor's schema.
  buildInput(city: string, limit: number): Record<string, unknown> {
    return { ...super.buildInput(city, limit), dealType: "forsale" };
  }
}
export class MadlanProvider extends ApifyProvider {
  constructor() {
    super("madlan", "APIFY_MADLAN_ACTOR_ID", "swerve/madlan-scraper");
  }
  // Madlan input adapter — adjust keys here to the real Madlan actor's schema.
  buildInput(city: string, limit: number): Record<string, unknown> {
    return { ...super.buildInput(city, limit), dealType: "sale" };
  }
}

export function getProvider(source: string): PropertyProvider {
  return source === "madlan" ? new MadlanProvider() : new Yad2Provider();
}

export async function runYad2Scraper(locality: string): Promise<NormalizedExternalListing[]> {
  const p = new Yad2Provider();
  return (await p.searchListings(locality)).map((r) => p.normalizeListing(r));
}
export async function runMadlanScraper(locality: string): Promise<NormalizedExternalListing[]> {
  const p = new MadlanProvider();
  return (await p.searchListings(locality)).map((r) => p.normalizeListing(r));
}

export function isApifyConfigured(): boolean {
  return !!process.env.APIFY_TOKEN;
}

/** Presence-only env check (never returns the secret values themselves). */
export function externalEnvStatus(): { apifyToken: boolean; yad2ActorId: boolean; madlanActorId: boolean; cronSecret: boolean } {
  return {
    apifyToken: !!process.env.APIFY_TOKEN,
    yad2ActorId: !!process.env.APIFY_YAD2_ACTOR_ID,
    madlanActorId: !!process.env.APIFY_MADLAN_ACTOR_ID,
    cronSecret: !!process.env.CRON_SECRET,
  };
}
