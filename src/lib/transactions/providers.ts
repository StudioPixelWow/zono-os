/**
 * GovMap Transactions provider — real official sold-price transactions via Apify.
 * SERVER-ONLY: APIFY_TOKEN is read from the environment and never exposed.
 *
 * Env:
 *   APIFY_TOKEN
 *   APIFY_GOVMAP_TRANSACTIONS_ACTOR_ID  (default swerve/madlan-deals)
 *
 * The actor returns real sold transactions. Documented fields:
 *   dealDate, dealAmount, pricePerSqm, address, cityName, neighborhood,
 *   rooms, floor, area, propertyType, gush, helka, tatHelka
 * Mapping is DEFENSIVE (alias lists) and the FULL raw payload is always stored,
 * so unmapped fields are never lost. No mock estimates in production.
 */
import "server-only";
import { ApifyClient } from "apify-client";
import {
  TRANSACTIONS_ACTOR_NAME, TRANSACTIONS_SOURCE,
  calculatePricePerSqm, extractHouseNumber, normalizeCityName, normalizeDealAmount, normalizeDealDate,
  normalizeNeighborhoodName, normalizeStreetName, normalizeTransactionAddress, normalizeTransactionArea, normalizeTransactionRooms,
} from "./engine";

export const DEFAULT_GOVMAP_ACTOR = "swerve/madlan-deals";
export const MAX_TXNS_PER_PULL = 1000;

export interface NormalizedTransaction {
  sourcePlatform: string;
  sourceActor: string;
  assetId: string | null;
  externalId: string | null;
  dealDate: string | null;
  dealAmount: number | null;
  pricePerSqm: number | null;
  address: string | null;
  normalizedAddress: string | null;
  cityName: string | null;
  neighborhoodName: string | null;
  street: string | null;
  streetNumber: string | null;
  lat: number | null;
  lng: number | null;
  rooms: number | null;
  floor: string | null;
  area: number | null;
  propertyType: string | null;
  isFirstHand: boolean | null;
  gush: string | null;
  helka: string | null;
  tatHelka: string | null;
  rawPayload: Record<string, unknown>;
}

export interface TransactionDebugResult {
  actorId: string;
  runStatus: string;
  datasetItems: number;
  inputSent: Record<string, unknown>;
  rawSample: Record<string, unknown> | null;
  normalizedSample: NormalizedTransaction | null;
  missingFields: string[];
  error: string | null;
}

export interface TransactionsActorInput {
  cities?: string[];
  neighborhoods?: string[];
  dealDateRange?: string; // "all" | "12" | ...
  dealType?: string;
}

type Raw = Record<string, unknown>;

const isDev = process.env.NODE_ENV !== "production";
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v).trim());
const pick = (raw: Raw, keys: string[]): unknown => {
  for (const k of keys) if (raw[k] != null && raw[k] !== "") return raw[k];
  return null;
};

function client(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN missing");
  return new ApifyClient({ token, maxRetries: 3 });
}

export function govmapActorId(): string {
  return process.env.APIFY_GOVMAP_TRANSACTIONS_ACTOR_ID || DEFAULT_GOVMAP_ACTOR;
}

export function isTransactionsApifyConfigured(): boolean {
  return !!process.env.APIFY_TOKEN;
}

export function transactionsEnvStatus(): { apifyToken: boolean; govmapActorId: boolean; actorId: string; cronSecret: boolean } {
  return {
    apifyToken: !!process.env.APIFY_TOKEN,
    govmapActorId: !!process.env.APIFY_GOVMAP_TRANSACTIONS_ACTOR_ID,
    actorId: govmapActorId(),
    cronSecret: !!process.env.CRON_SECRET,
  };
}

/** Build actor input for a coverage target. */
export function buildTransactionsInput(city: string, neighborhood: string | null, dealDateRange: string): TransactionsActorInput {
  const input: TransactionsActorInput = { cities: [city], dealDateRange, dealType: "all" };
  if (neighborhood) input.neighborhoods = [neighborhood];
  return input;
}

/** Run the actor and return its default dataset items (bounded). */
export async function runTransactionsActor(input: TransactionsActorInput, limit = MAX_TXNS_PER_PULL): Promise<Raw[]> {
  const run = await client().actor(govmapActorId()).call(input as Record<string, unknown>, { timeout: 240, waitSecs: 230, memory: 1024 });
  if (run.status !== "SUCCEEDED") throw new Error(`actor ${govmapActorId()} status=${run.status}`);
  return fetchDatasetItems(run.defaultDatasetId, limit);
}

export async function fetchDatasetItems(datasetId: string | undefined, limit = MAX_TXNS_PER_PULL): Promise<Raw[]> {
  if (!datasetId) return [];
  const { items } = await client().dataset(datasetId).listItems({ limit });
  return items as Raw[];
}

/** Defensive normalization from the real returned structure. */
export function normalizeTransaction(raw: Raw): NormalizedTransaction {
  const dealAmount = normalizeDealAmount(pick(raw, ["dealAmount", "price", "amount", "dealSum", "mchir", "priceNis"]));
  const area = normalizeTransactionArea(pick(raw, ["area", "sqm", "size", "squareMeters", "shetach"]));
  const pricePerSqm = calculatePricePerSqm(dealAmount, area, pick(raw, ["pricePerSqm", "pricePerMeter", "ppsqm", "mchirLemeter"]));
  const address = str(pick(raw, ["address", "fullAddress", "ktovet", "addressText"]));
  const street = normalizeStreetName(str(pick(raw, ["street", "streetName", "rechov"])) ?? address);
  const streetNumber = str(pick(raw, ["streetNumber", "houseNumber", "mispar", "number"])) ?? extractHouseNumber(address);
  const cityName = normalizeCityName(str(pick(raw, ["cityName", "city", "ir", "settlement", "yeshuv"])));
  const neighborhoodName = normalizeNeighborhoodName(str(pick(raw, ["neighborhood", "neighbourhood", "neighborhoodName", "shchuna", "hood"])));
  const propertyType = str(pick(raw, ["propertyType", "assetType", "type", "sugNechZ"]));
  const firstHandRaw = pick(raw, ["isFirstHand", "firstHand", "yadRishona"]);
  return {
    sourcePlatform: TRANSACTIONS_SOURCE,
    sourceActor: TRANSACTIONS_ACTOR_NAME,
    assetId: str(pick(raw, ["assetId", "id", "dealId", "transactionId", "_id"])),
    externalId: str(pick(raw, ["externalId", "id", "dealId"])),
    dealDate: normalizeDealDate(pick(raw, ["dealDate", "date", "saleDate", "taarichIska", "dealDateTime"])),
    dealAmount,
    pricePerSqm,
    address,
    normalizedAddress: normalizeTransactionAddress({ address, street, streetNumber }),
    cityName,
    neighborhoodName,
    street,
    streetNumber,
    lat: num(pick(raw, ["lat", "latitude", "y"])),
    lng: num(pick(raw, ["lng", "lon", "longitude", "x"])),
    rooms: normalizeTransactionRooms(pick(raw, ["rooms", "roomsCount", "numberOfRooms", "chadarim"])),
    floor: str(pick(raw, ["floor", "floorNumber", "koma"])),
    area,
    propertyType,
    isFirstHand: typeof firstHandRaw === "boolean" ? firstHandRaw : null,
    gush: str(pick(raw, ["gush", "block"])),
    helka: str(pick(raw, ["helka", "parcel", "chelka"])),
    tatHelka: str(pick(raw, ["tatHelka", "tat_helka", "subParcel"])),
    rawPayload: raw,
  };
}

/** Fields we expect; reported as "missing" when absent in the raw sample. */
const EXPECTED_FIELDS = ["dealDate", "dealAmount", "pricePerSqm", "address", "cityName", "neighborhood", "rooms", "floor", "area", "propertyType", "gush", "helka", "tatHelka"];

/** Non-destructive diagnostic run — never throws, never persists. */
export async function debugTransactionsActor(city: string, neighborhood: string | null, limit = 5): Promise<TransactionDebugResult> {
  const actorId = govmapActorId();
  const inputSent = buildTransactionsInput(city, neighborhood, "all") as Record<string, unknown>;
  if (!process.env.APIFY_TOKEN) {
    return { actorId, runStatus: "NO_TOKEN", datasetItems: 0, inputSent, rawSample: null, normalizedSample: null, missingFields: EXPECTED_FIELDS, error: "APIFY_TOKEN missing" };
  }
  try {
    const run = await client().actor(actorId).call(inputSent, { timeout: 120, waitSecs: 110, memory: 1024 });
    const items = await fetchDatasetItems(run.defaultDatasetId, limit);
    const sample = (items[0] ?? null) as Raw | null;
    const normalized = sample ? normalizeTransaction(sample) : null;
    const missingFields = sample ? EXPECTED_FIELDS.filter((f) => sample[f] == null) : EXPECTED_FIELDS;
    return {
      actorId, runStatus: run.status, datasetItems: items.length, inputSent,
      rawSample: sample, normalizedSample: normalized, missingFields,
      error: run.status === "SUCCEEDED" ? null : `actor finished with status=${run.status}`,
    };
  } catch (e) {
    return { actorId, runStatus: "ERROR", datasetItems: 0, inputSent, rawSample: null, normalizedSample: null, missingFields: EXPECTED_FIELDS, error: e instanceof Error ? e.message : "unknown Apify error" };
  }
}

export { isDev as transactionsIsDev };
