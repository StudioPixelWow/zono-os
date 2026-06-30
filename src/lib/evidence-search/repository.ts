// ============================================================================
// Evidence Search Engine™ — repository (server-only). READ-ONLY, org-scoped via
// the RLS client. Reads every available comparable source defensively (select *
// so a missing column never errors). Returns raw rows + which org column worked.
// No writes, no scraping, no fabrication.
// ============================================================================
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { EvidenceSourceId, ComparableSource } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

export interface SourceSpec {
  id: EvidenceSourceId;
  table: string;
  orgCols: string[];
  comparableType: "sold" | "listing";
  /** Fixed ComparableSource, or "from_row" to read row.source/provider. */
  comparableSource: ComparableSource | "from_row";
  wired: boolean;                 // read by the live valuation pipeline today
  cityFields: string[];
  neighborhoodFields: string[];
  streetFields: string[];
  roomsFields: string[];
  sqmFields: string[];
  priceFields: string[];
  ppsqmFields: string[];
  latFields: string[];
  lngFields: string[];
  idFields: string[];
  typeFields: string[];
  saleDateFields: string[];
  listingDateFields: string[];
  sourceField: string[];          // when comparableSource === "from_row"
  activeFilter?: { col: string; val: boolean };
}

export const SOURCE_SPECS: SourceSpec[] = [
  {
    id: "property_transactions", table: "property_transactions", orgCols: ["organization_id", "org_id"],
    comparableType: "sold", comparableSource: "govmap", wired: true,
    cityFields: ["city_name", "city"], neighborhoodFields: ["neighborhood_name", "neighborhood"], streetFields: ["street", "address"],
    roomsFields: ["rooms"], sqmFields: ["sqm", "area", "deal_area", "built_area"],
    priceFields: ["deal_amount", "price"], ppsqmFields: ["price_per_sqm"],
    latFields: ["lat", "latitude"], lngFields: ["lng", "longitude"], idFields: ["id"],
    typeFields: ["property_type"], saleDateFields: ["deal_date", "transaction_date"], listingDateFields: [], sourceField: [],
  },
  {
    id: "external_listings", table: "external_listings", orgCols: ["org_id", "organization_id"],
    comparableType: "listing", comparableSource: "from_row", wired: true,
    cityFields: ["city", "city_name"], neighborhoodFields: ["neighborhood"], streetFields: ["street"],
    roomsFields: ["rooms"], sqmFields: ["sqm", "area_sqm", "size_sqm", "area"],
    priceFields: ["price", "asking_price"], ppsqmFields: ["price_per_sqm"],
    latFields: ["lat", "latitude"], lngFields: ["lng", "longitude"], idFields: ["external_id", "id"],
    typeFields: ["property_type"], saleDateFields: [], listingDateFields: ["published_at", "first_seen_at"],
    sourceField: ["source", "provider"], activeFilter: { col: "is_active", val: true },
  },
  {
    id: "properties", table: "properties", orgCols: ["org_id", "organization_id"],
    comparableType: "listing", comparableSource: "zono", wired: true,
    cityFields: ["city", "city_name"], neighborhoodFields: ["neighborhood"], streetFields: ["street", "name"],
    roomsFields: ["rooms"], sqmFields: ["size_sqm", "sqm", "area"],
    priceFields: ["price", "asking_price"], ppsqmFields: ["price_per_sqm"],
    latFields: ["latitude", "lat"], lngFields: ["longitude", "lng"], idFields: ["id"],
    typeFields: ["property_type"], saleDateFields: [], listingDateFields: ["listed_at", "updated_at"], sourceField: [],
  },
  {
    id: "market_property_sources", table: "market_property_sources", orgCols: ["org_id", "organization_id"],
    comparableType: "listing", comparableSource: "from_row", wired: false,
    cityFields: ["city", "city_name"], neighborhoodFields: ["neighborhood"], streetFields: ["street", "address"],
    roomsFields: ["rooms"], sqmFields: ["sqm", "size_sqm", "area_sqm", "area"],
    priceFields: ["price", "asking_price", "amount"], ppsqmFields: ["price_per_sqm"],
    latFields: ["lat", "latitude"], lngFields: ["lng", "longitude"], idFields: ["external_id", "id"],
    typeFields: ["property_type"], saleDateFields: ["sold_at", "deal_date"], listingDateFields: ["published_at", "created_at"],
    sourceField: ["source", "provider"],
  },
];

export interface SourceFetch { rows: Row[]; error: string | null; orgColUsed: string | null }

/** Defensive read of one source. Tries each org column until one works. */
export async function fetchTableSource(db: DB, orgId: string, spec: SourceSpec, limit = 8000): Promise<SourceFetch> {
  let lastErr: string | null = null;
  for (const orgCol of spec.orgCols) {
    try {
      let q = db.from(spec.table as never).select("*").eq(orgCol, orgId).limit(limit);
      if (spec.activeFilter) q = q.eq(spec.activeFilter.col, spec.activeFilter.val);
      const { data, error } = await q;
      if (error) { lastErr = error.message; continue; }
      return { rows: (data ?? []) as Row[], error: null, orgColUsed: orgCol };
    } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
  }
  return { rows: [], error: lastErr, orgColUsed: null };
}
