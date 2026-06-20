/**
 * Madlan City Transactions provider — PRIMARY city-coverage source. Uses the
 * Apify actor `swerve/madlan-analytics` with dataTypes:["deals"], which queries
 * Madlan.co.il's public GraphQL API directly and returns the full city
 * transaction list (the ~1000 rows shown on madlan.co.il/area-info/<city>).
 * SERVER-ONLY: APIFY_TOKEN never exposed. Defensive mapping + full raw payload.
 */
import "server-only";
import { ApifyClient } from "apify-client";
import {
  TRANSACTIONS_ACTOR_NAME, calculatePricePerSqm, extractHouseNumber, normalizeCityName, normalizeDealAmount,
  normalizeDealDate, normalizeNeighborhoodName, normalizeStreetName, normalizeTransactionAddress,
  normalizeTransactionArea, normalizeTransactionRooms,
} from "./engine";

export const MADLAN_SOURCE = "madlan_transactions";
export const DEFAULT_MADLAN_ACTOR = "swerve/madlan-analytics";
export const MADLAN_ACTOR_NAME = "Madlan Analytics - Israel Real Estate Market Data";

type Raw = Record<string, unknown>;

export interface NormalizedMadlanTransaction {
  sourcePlatform: string;
  sourceActor: string;
  madlanTransactionId: string | null;
  dealDate: string | null;
  dealAmount: number | null;
  pricePerSqm: number | null;
  address: string | null;
  normalizedAddress: string | null;
  cityName: string | null;
  neighborhoodName: string | null;
  street: string | null;
  streetNumber: string | null;
  rooms: number | null;
  floor: string | null;
  area: number | null;
  propertyType: string | null;
  buildingYear: number | null;
  mediation: string | null;
  sourceUrl: string | null;
  rawPayload: Record<string, unknown>;
}

export interface MadlanDebugResult {
  actorId: string;
  runStatus: string;
  datasetItems: number;
  dealsFound: number;
  inputSent: Record<string, unknown>;
  rawSample: Raw | null;
  normalizedSample: NormalizedMadlanTransaction | null;
  recordKeys: string[];
  error: string | null;
}

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

export function madlanActorId(): string {
  return process.env.APIFY_MADLAN_ANALYTICS_ACTOR_ID || DEFAULT_MADLAN_ACTOR;
}
export function isMadlanConfigured(): boolean {
  return !!process.env.APIFY_TOKEN;
}
export function madlanEnvStatus(): { apifyToken: boolean; madlanActorId: boolean; actorId: string } {
  return { apifyToken: !!process.env.APIFY_TOKEN, madlanActorId: !!process.env.APIFY_MADLAN_ANALYTICS_ACTOR_ID, actorId: madlanActorId() };
}

export function buildMadlanInput(city: string, neighbourhood: string | null): Record<string, unknown> {
  const input: Record<string, unknown> = { city, dataTypes: ["deals"] };
  if (neighbourhood) input.neighbourhood = neighbourhood;
  return input;
}

/** Pull the per-city record(s) and flatten their `deals` arrays (blocking). */
export async function runMadlanDeals(city: string, neighbourhood: string | null): Promise<Raw[]> {
  const run = await client().actor(madlanActorId()).call(buildMadlanInput(city, neighbourhood), { timeout: 300, waitSecs: 290, memory: 1024 });
  if (run.status !== "SUCCEEDED") throw new Error(`actor ${madlanActorId()} status=${run.status}`);
  if (!run.defaultDatasetId) return [];
  const { items } = await client().dataset(run.defaultDatasetId).listItems({ limit: 10 });
  return extractDeals(items as Raw[]);
}

// ── Non-blocking run (client-polled live progress) ───────────────────────────
export async function startMadlanRun(city: string, neighbourhood: string | null): Promise<{ runId: string; datasetId: string | null; status: string }> {
  const run = await client().actor(madlanActorId()).start(buildMadlanInput(city, neighbourhood), { memory: 1024 });
  return { runId: run.id, datasetId: run.defaultDatasetId ?? null, status: run.status };
}

export async function getMadlanRun(runId: string): Promise<{ status: string; datasetId: string | null; found: number; startedAt: string | null }> {
  const run = await client().run(runId).get();
  let found = 0;
  const datasetId = run?.defaultDatasetId ?? null;
  if (datasetId) { try { const ds = await client().dataset(datasetId).get(); found = (ds as { itemCount?: number } | undefined)?.itemCount ?? 0; } catch { /* ignore */ } }
  return { status: run?.status ?? "UNKNOWN", datasetId, found, startedAt: run?.startedAt ? new Date(run.startedAt).toISOString() : null };
}

export async function fetchMadlanDealsFromDataset(datasetId: string): Promise<Raw[]> {
  const { items } = await client().dataset(datasetId).listItems({ limit: 10 });
  return extractDeals(items as Raw[]);
}

const DEAL_ARRAY_KEYS = ["deals", "recentDeals", "transactions", "dealList", "soldDeals", "closedDeals", "dealsList", "data"];
// Keys that mark an aggregate CITY/analytics record — never a single deal.
const AGGREGATE_KEYS = ["pricesbyrooms", "demographics", "hierarchy", "ratings", "yearlydeals", "schoolsrating", "demographicindex", "bulletinsforsale", "bulletinsforrent", "insights", "neighborhoods", "boundaries", "roi"];
const looksLikeDeal = (o: Raw): boolean => {
  const keys = Object.keys(o).map((s) => s.toLowerCase());
  if (keys.filter((k) => AGGREGATE_KEYS.includes(k)).length >= 2) return false; // analytics record
  const k = keys.join(",");
  const hasPrice = /(deal|sold|closed)?(price|amount)|מחיר/.test(k);
  const hasAddr = /address|street|כתובת|rechov/.test(k);
  const hasDate = /date|תאריך/.test(k);
  // A real deal row needs a price AND (a specific address OR a date).
  return hasPrice && (hasAddr || hasDate);
};

/**
 * Flatten the actor output to individual deal rows. Robust to both shapes:
 *  (a) one city record holding a nested deals array (deals/recentDeals/...),
 *  (b) each dataset item already IS a deal row.
 * Also scans nested objects for the first deal-like array.
 */
export function extractDeals(records: Raw[]): Raw[] {
  const out: Raw[] = [];
  for (const rec of records) {
    const cityName = str(pick(rec, ["cityHebrew", "city", "cityName"]));
    // (b) the record itself is a deal
    if (looksLikeDeal(rec) && !DEAL_ARRAY_KEYS.some((k) => Array.isArray(rec[k]))) {
      out.push(rec);
      continue;
    }
    // (a) named arrays
    let pushed = false;
    for (const key of DEAL_ARRAY_KEYS) {
      const arr = rec[key];
      if (Array.isArray(arr) && arr.length && arr[0] && typeof arr[0] === "object" && looksLikeDeal(arr[0] as Raw)) {
        for (const d of arr) if (d && typeof d === "object") out.push({ ...(d as Raw), __cityName: cityName });
        pushed = true;
      }
    }
    if (pushed) continue;
    // (c) deep scan for the first deal-like array anywhere in the record
    const stack: unknown[] = [rec];
    let depth = 0;
    while (stack.length && depth < 5000) {
      depth++;
      const o = stack.pop();
      if (!o || typeof o !== "object") continue;
      if (Array.isArray(o)) {
        if (o.length && o[0] && typeof o[0] === "object" && looksLikeDeal(o[0] as Raw)) {
          for (const d of o) if (d && typeof d === "object") out.push({ ...(d as Raw), __cityName: cityName });
          break;
        }
        for (const v of o) stack.push(v);
      } else {
        for (const v of Object.values(o as Raw)) stack.push(v);
      }
    }
  }
  return out;
}

export function normalizeMadlanTransaction(raw: Raw): NormalizedMadlanTransaction {
  const dealAmount = normalizeDealAmount(pick(raw, ["dealAmount", "price", "soldPrice", "priceClosed", "amount", "dealSum"]));
  const area = normalizeTransactionArea(pick(raw, ["area", "sqm", "size", "squareMeters", "netArea", "builtArea"]));
  const pricePerSqm = calculatePricePerSqm(dealAmount, area, pick(raw, ["pricePerSqm", "pricePerMeter", "ppsqm"]));
  const address = str(pick(raw, ["address", "fullAddress", "addressText", "displayAddress"]));
  const street = normalizeStreetName(str(pick(raw, ["street", "streetName"])) ?? address);
  const streetNumber = str(pick(raw, ["houseNumber", "streetNumber", "number"])) ?? extractHouseNumber(address);
  const cityName = normalizeCityName(str(pick(raw, ["cityName", "city", "__cityName"])));
  return {
    sourcePlatform: MADLAN_SOURCE,
    sourceActor: MADLAN_ACTOR_NAME,
    madlanTransactionId: str(pick(raw, ["id", "dealId", "transactionId", "_id", "dealNumber"])),
    dealDate: normalizeDealDate(pick(raw, ["dealDate", "date", "soldDate", "saleDate", "registrationDate"])),
    dealAmount,
    pricePerSqm,
    address,
    normalizedAddress: normalizeTransactionAddress({ address, street, streetNumber }),
    cityName,
    neighborhoodName: normalizeNeighborhoodName(str(pick(raw, ["neighborhood", "neighbourhood", "neighborhoodName", "hood"]))),
    street,
    streetNumber,
    rooms: normalizeTransactionRooms(pick(raw, ["rooms", "roomsCount", "numberOfRooms"])),
    floor: str(pick(raw, ["floor", "floorNumber"])),
    area,
    propertyType: str(pick(raw, ["propertyType", "assetType", "type", "buildingType"])),
    buildingYear: (() => { const y = num(pick(raw, ["buildingYear", "yearBuilt", "builtYear", "constructionYear", "buildYear"])); return y && y > 1800 && y < 2100 ? Math.round(y) : null; })(),
    mediation: str(pick(raw, ["mediation", "agency", "agencyName", "brokerName", "agentName", "realEstateOffice"])),
    sourceUrl: str(pick(raw, ["url", "link", "dealUrl", "pageUrl"])),
    rawPayload: raw,
  };
}

export async function debugMadlanDeals(city: string, neighbourhood: string | null): Promise<MadlanDebugResult> {
  const actorId = madlanActorId();
  const inputSent = buildMadlanInput(city, neighbourhood);
  if (!process.env.APIFY_TOKEN) {
    return { actorId, runStatus: "NO_TOKEN", datasetItems: 0, dealsFound: 0, inputSent, rawSample: null, normalizedSample: null, recordKeys: [], error: "APIFY_TOKEN missing" };
  }
  try {
    const run = await client().actor(actorId).call(inputSent, { timeout: 180, waitSecs: 170, memory: 1024 });
    let records: Raw[] = [];
    if (run.defaultDatasetId) { const r = await client().dataset(run.defaultDatasetId).listItems({ limit: 5 }); records = r.items as Raw[]; }
    const deals = extractDeals(records);
    const sample = (deals[0] ?? null) as Raw | null;
    return {
      actorId, runStatus: run.status, datasetItems: records.length, dealsFound: deals.length, inputSent,
      rawSample: sample, normalizedSample: sample ? normalizeMadlanTransaction(sample) : null,
      recordKeys: records[0] ? Object.keys(records[0]) : [],
      error: run.status === "SUCCEEDED" ? (deals.length ? null : "run ok but no deals array found — check record keys / dataTypes") : `status=${run.status}`,
    };
  } catch (e) {
    return { actorId, runStatus: "ERROR", datasetItems: 0, dealsFound: 0, inputSent, rawSample: null, normalizedSample: null, recordKeys: [], error: e instanceof Error ? e.message : "unknown Apify error" };
  }
}

export { TRANSACTIONS_ACTOR_NAME as GOVMAP_ACTOR_NAME };
