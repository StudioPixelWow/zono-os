// ============================================================================
// ZONO Price Intelligence — READ-ONLY valuation evidence diagnostic.
// ----------------------------------------------------------------------------
// diagnoseValuationEvidence(valuationId) proves WHY a valuation has no evidence:
//   • real data gap            (no rows in the area at all)
//   • city-name / address mismatch (rows exist under a different spelling, or
//                                nearby by coordinates, but the exact city filter
//                                excludes them)
//   • missing price/sqm         (rows exist but no usable price-per-sqm)
//   • provider wiring/schema    (a provider errors, or usable rows live in a
//                                table no valuation provider reads — e.g.
//                                market_property_sources)
// NO writes, NO mutations, NO AI. It only counts rows and runs the existing
// providers read-only. Calculations, filters and providers are left untouched.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { gatherEvidence, getBrokerSoldProperties } from "./providers";
import { rowToInput } from "./service";
import { normalizeInput } from "./valuation-engine";
import type { ValuationInput } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const numOf = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const firstStr = (row: Row, fields: string[]): string => { for (const f of fields) { const v = str(row[f]); if (v) return v; } return ""; };
const firstNum = (row: Row, fields: string[]): number | null => { for (const f of fields) { const n = numOf(row[f]); if (n != null) return n; } return null; };

// ── Hebrew-aware city normalization (trim · hyphens · whitespace · finals · case)
const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
export function normalizeCity(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/[׳״"'`]/g, "")          // gershayim / quotes
    .replace(/[-־–—_]/g, " ")          // hyphen / maqaf variants → space
    .replace(/קירי/g, "קרי")           // קריית → קרית normalization
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c) // final letters → base form
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const RADIUS_M = 2000; // "nearby" radius for the coordinate-based candidate check
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface SourceDiag {
  exactCityCount: number;
  exactCityUsableCount: number;
  nearCityMatches: number;            // normalized city equal
  usableNearCityMatches: number;
  nearbyRadiusCount: number;          // within RADIUS_M of the subject coords
  usableNearbyRadiusCount: number;
  rowsScanned: number;
  distinctCities: string[];
  likelyMismatches: string[];         // raw city strings that normalize-equal but differ from the exact value
  queryError: string | null;
}

export interface ValuationEvidenceDiagnosis {
  valuationId: string;
  input: {
    city: string | null; cityNormalized: string; neighborhood: string | null;
    propertyType: string | null; rooms: number | null; sqm: number | null;
    latitude: number | null; longitude: number | null;
  };
  address: {
    rawAddress: string | null; houseNumber: string | null; street: string | null;
    hasCoordinates: boolean; latitude: number | null; longitude: number | null;
    normalizedCity: string | null; normalizedStreet: string | null; normalizedNeighborhood: string | null;
    geocodeSource: string | null; geocodeConfidence: number | null;
    linkedPropertyId: string | null;
    matchability: { exactCity: boolean; hasNeighborhood: boolean; canRadius: boolean; hasStreet: boolean };
  };
  sources: {
    propertyTransactions: SourceDiag;
    externalListings: SourceDiag;
    properties: SourceDiag;
    marketPropertySources: SourceDiag;
    brokerSold: { count: number; usableCount: number; queryError: string | null };
  };
  providerRun: { source: string; status: string; message: string | null; count: number; usableCount: number }[];
  wiringMap: { source: string; table: string; wired: boolean; note: string }[];
  cityNormalization: {
    valuationCityNormalized: string;
    distinctTransactionCities: string[];
    distinctListingCities: string[];
    likelyCityMismatches: string[];
  };
  conclusion: "DATA_GAP" | "CITY_NORMALIZATION_MISMATCH" | "ADDRESS_RESOLUTION_MISMATCH" | "MISSING_PRICE_OR_SQM" | "PROVIDER_NOT_WIRED" | "UNKNOWN";
  recommendedNextStep: "import_data" | "apply_city_normalization_fix" | "wire_market_property_sources" | "inspect_provider" | "none";
  notes: string[];
}

const SCAN_LIMIT = 8000;

interface TableSpec {
  table: string; orgCols: string[]; cityFields: string[]; priceFields: string[];
  sqmFields: string[]; ppsqmFields: string[]; latFields: string[]; lngFields: string[];
}

/** Read a table (select * → defensive against unknown columns) and tally evidence. */
async function analyzeTable(
  db: Awaited<ReturnType<typeof createClient>>, orgId: string, spec: TableSpec,
  valCityRaw: string, valCityNorm: string, subjLat: number | null, subjLng: number | null,
): Promise<SourceDiag> {
  const empty: SourceDiag = {
    exactCityCount: 0, exactCityUsableCount: 0, nearCityMatches: 0, usableNearCityMatches: 0,
    nearbyRadiusCount: 0, usableNearbyRadiusCount: 0, rowsScanned: 0,
    distinctCities: [], likelyMismatches: [], queryError: null,
  };
  let rows: Row[] | null = null;
  let lastErr: string | null = null;
  for (const orgCol of spec.orgCols) {
    try {
      const { data, error } = await db.from(spec.table as never).select("*").eq(orgCol, orgId).limit(SCAN_LIMIT);
      if (error) { lastErr = error.message; continue; }
      rows = (data ?? []) as Row[]; lastErr = null; break;
    } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
  }
  if (rows == null) return { ...empty, queryError: lastErr };

  let exact = 0, exactUsable = 0, near = 0, nearUsable = 0, radius = 0, radiusUsable = 0;
  const distinct = new Set<string>();
  const mism = new Set<string>();
  for (const row of rows) {
    const cityRaw = firstStr(row, spec.cityFields);
    const price = firstNum(row, spec.priceFields);
    const sqm = firstNum(row, spec.sqmFields);
    const ppsqmDirect = firstNum(row, spec.ppsqmFields);
    const ppsqm = ppsqmDirect && ppsqmDirect > 0 ? ppsqmDirect : (price && price > 0 && sqm && sqm > 0 ? price / sqm : null);
    const usable = !!ppsqm && ppsqm > 0;
    if (cityRaw) distinct.add(cityRaw);
    const isExact = !!valCityRaw && cityRaw === valCityRaw;
    const isNear = !!valCityNorm && normalizeCity(cityRaw) === valCityNorm;
    if (isExact) { exact++; if (usable) exactUsable++; }
    if (isNear) { near++; if (usable) nearUsable++; }
    if (isNear && !isExact && cityRaw) mism.add(cityRaw);
    if (subjLat != null && subjLng != null) {
      const rlat = firstNum(row, spec.latFields), rlng = firstNum(row, spec.lngFields);
      if (rlat != null && rlng != null && haversine(subjLat, subjLng, rlat, rlng) <= RADIUS_M) {
        radius++; if (usable) radiusUsable++;
      }
    }
  }
  return {
    exactCityCount: exact, exactCityUsableCount: exactUsable,
    nearCityMatches: near, usableNearCityMatches: nearUsable,
    nearbyRadiusCount: radius, usableNearbyRadiusCount: radiusUsable,
    rowsScanned: rows.length, distinctCities: [...distinct].slice(0, 40),
    likelyMismatches: [...mism].slice(0, 20), queryError: null,
  };
}

/** READ-ONLY evidence diagnosis for a single valuation. Returns null if not found. */
export async function diagnoseValuationEvidence(valuationId: string): Promise<ValuationEvidenceDiagnosis | null> {
  const { profile, user } = await getSessionContext();
  if (!profile?.org_id || !user) throw new Error("אין הרשאה.");
  const orgId = profile.org_id;
  const db = await createClient();

  const { data: valRow } = await db.from("property_valuations" as never)
    .select("*").eq("id", valuationId).eq("organization_id", orgId).maybeSingle();
  if (!valRow) return null;
  const vr = valRow as Row;
  const input: ValuationInput = normalizeInput(rowToInput(vr));
  const valCityRaw = (input.city ?? "").trim();
  const valCityNorm = normalizeCity(input.city);
  const subjLat = input.latitude ?? null;
  const subjLng = input.longitude ?? null;

  // ── Address resolution (read defensively; columns may not exist) ────────────
  const linkedPropertyId = str(vr.property_id) || null;
  let propRow: Row | null = null;
  if (linkedPropertyId) {
    const { data } = await db.from("properties" as never).select("*").eq("id", linkedPropertyId).maybeSingle();
    propRow = (data ?? null) as Row | null;
  }
  const addrField = (fields: string[]): string | null => firstStr(vr, fields) || (propRow ? firstStr(propRow, fields) : "") || null;
  const address: ValuationEvidenceDiagnosis["address"] = {
    rawAddress: addrField(["address", "full_address", "raw_address"]),
    houseNumber: addrField(["house_number", "building_number"]),
    street: input.street ?? addrField(["street"]),
    hasCoordinates: subjLat != null && subjLng != null,
    latitude: subjLat, longitude: subjLng,
    normalizedCity: addrField(["normalized_city"]),
    normalizedStreet: addrField(["normalized_street"]),
    normalizedNeighborhood: addrField(["normalized_neighborhood"]),
    geocodeSource: addrField(["geocode_source", "geo_source"]),
    geocodeConfidence: firstNum(vr, ["geocode_confidence"]) ?? (propRow ? firstNum(propRow, ["geocode_confidence"]) : null),
    linkedPropertyId,
    matchability: {
      exactCity: !!valCityRaw,
      hasNeighborhood: !!input.neighborhood,
      canRadius: subjLat != null && subjLng != null,
      hasStreet: !!(input.street ?? addrField(["street"])),
    },
  };

  // ── Source tables (defensive select *; never errors on a missing column) ────
  const [propertyTransactions, externalListings, properties, marketPropertySources] = await Promise.all([
    analyzeTable(db, orgId, {
      table: "property_transactions", orgCols: ["organization_id", "org_id"],
      cityFields: ["city_name", "city"], priceFields: ["deal_amount", "price"],
      sqmFields: ["sqm", "area", "deal_area", "built_area"], ppsqmFields: ["price_per_sqm"],
      latFields: ["lat", "latitude"], lngFields: ["lng", "longitude"],
    }, valCityRaw, valCityNorm, subjLat, subjLng),
    analyzeTable(db, orgId, {
      table: "external_listings", orgCols: ["org_id", "organization_id"],
      cityFields: ["city", "city_name"], priceFields: ["price", "asking_price"],
      sqmFields: ["sqm", "area_sqm", "size_sqm", "area"], ppsqmFields: ["price_per_sqm"],
      latFields: ["lat", "latitude"], lngFields: ["lng", "longitude"],
    }, valCityRaw, valCityNorm, subjLat, subjLng),
    analyzeTable(db, orgId, {
      table: "properties", orgCols: ["org_id", "organization_id"],
      cityFields: ["city", "city_name"], priceFields: ["price", "asking_price"],
      sqmFields: ["size_sqm", "sqm", "area"], ppsqmFields: ["price_per_sqm"],
      latFields: ["latitude", "lat"], lngFields: ["longitude", "lng"],
    }, valCityRaw, valCityNorm, subjLat, subjLng),
    analyzeTable(db, orgId, {
      table: "market_property_sources", orgCols: ["org_id", "organization_id"],
      cityFields: ["city", "city_name"], priceFields: ["price", "asking_price", "amount"],
      sqmFields: ["sqm", "size_sqm", "area_sqm", "area"], ppsqmFields: ["price_per_sqm"],
      latFields: ["lat", "latitude"], lngFields: ["lng", "longitude"],
    }, valCityRaw, valCityNorm, subjLat, subjLng),
  ]);

  // ── Run the real providers READ-ONLY → exposes wiring/schema errors ──────────
  let providerRun: ValuationEvidenceDiagnosis["providerRun"] = [];
  let brokerSold = { count: 0, usableCount: 0, queryError: null as string | null };
  try {
    const ev = await gatherEvidence({ db, orgId, input, limit: 60 });
    providerRun = ev.providers.map((p) => ({
      source: p.source, status: p.status, message: p.message ?? null,
      count: p.comparables.length, usableCount: p.comparables.filter((c) => (c.pricePerSqm ?? 0) > 0).length,
    }));
  } catch (e) { brokerSold.queryError = e instanceof Error ? e.message : String(e); }
  try {
    const bs = await getBrokerSoldProperties(db, orgId, input);
    brokerSold = { count: bs.length, usableCount: bs.filter((b) => (b.pricePerSqm ?? 0) > 0).length, queryError: brokerSold.queryError };
  } catch (e) { brokerSold.queryError = e instanceof Error ? e.message : String(e); }

  // ── Provider wiring map (static — what the valuation engine actually reads) ──
  const wiringMap: ValuationEvidenceDiagnosis["wiringMap"] = [
    { source: "GovMap (עסקאות רשמיות)", table: "property_transactions", wired: true, note: "ספק govmap — עסקאות סגורות" },
    { source: "מודעות פורטלים", table: "external_listings", wired: true, note: "ספקי yad2/madlan — מודעות פעילות" },
    { source: "מלאי פנימי", table: "properties", wired: true, note: "ספק zono-internal — כל נכסי הארגון עם מחיר" },
    { source: "עסקאות שמכר המתווך", table: "deals (status=won)", wired: true, note: "broker-sold — סקציית אמון" },
    { source: "רשות המסים", table: "tax_authority API", wired: false, note: "stub — לא מחובר (זמין דרך GovMap)" },
    { source: "מקורות שוק", table: "market_property_sources", wired: false, note: "אף ספק הערכה לא קורא טבלה זו" },
    { source: "קבלת שוק", table: "market_acceptance_aggregates", wired: false, note: "משמש את מנוע המשקלים בלבד — לא מקור השוואה" },
  ];

  // ── Conclusion ──────────────────────────────────────────────────────────────
  const notes: string[] = [];
  const internal = [propertyTransactions, externalListings, properties];
  const tableErrors = [...internal, marketPropertySources].filter((t) => t.queryError);
  const providerErrors = providerRun.filter((p) => p.status === "error");
  const totalExact = internal.reduce((n, t) => n + t.exactCityCount, 0);
  const totalExactUsable = internal.reduce((n, t) => n + t.exactCityUsableCount, 0);
  const totalNear = internal.reduce((n, t) => n + t.nearCityMatches, 0);
  const totalNearUsable = internal.reduce((n, t) => n + t.usableNearCityMatches, 0);
  const totalRadiusUsable = internal.reduce((n, t) => n + t.usableNearbyRadiusCount, 0);
  const mpsRowsUsableAnywhere = !marketPropertySources.queryError && marketPropertySources.rowsScanned > 0
    && internal.every((t) => t.exactCityUsableCount === 0);
  const allMismatches = [...new Set([...propertyTransactions.likelyMismatches, ...externalListings.likelyMismatches, ...properties.likelyMismatches])];

  for (const p of providerErrors) notes.push(`ספק "${p.source}" מחזיר שגיאה: ${p.message ?? "—"}`);
  for (const t of tableErrors) notes.push(`שאילתת טבלה נכשלה: ${t.queryError}`);
  if (!input.city) notes.push('להערכה אין עיר — לא ניתן לאתר ראיות (חסר קלט "עיר").');
  if (!input.builtSqm || input.builtSqm <= 0) notes.push('להערכה חסר שטח בנוי במ"ר — גם עם ראיות, השווי לא יחושב.');
  if (!address.hasCoordinates) notes.push("לנכס אין קואורדינטות — חיפוש רדיוס לא זמין; ההתאמה מסתמכת על שם עיר מדויק בלבד.");

  let conclusion: ValuationEvidenceDiagnosis["conclusion"];
  let recommendedNextStep: ValuationEvidenceDiagnosis["recommendedNextStep"];

  if (providerErrors.length > 0 || tableErrors.some((t) => internal.includes(t))) {
    conclusion = "PROVIDER_NOT_WIRED";
    recommendedNextStep = "inspect_provider";
    if (totalExactUsable > 0 || totalNearUsable > 0) notes.push("יש שורות שמישות בטבלה, אך הספק לא הצליח לקרוא אותן — תקלת חיווט/סכמה ולא חוסר נתונים.");
  } else if (totalExactUsable > 0) {
    conclusion = "UNKNOWN";
    recommendedNextStep = "none";
    notes.push("נמצאו ראיות שמישות בעיר המדויקת — ההערכה אמורה להתקבל. אם עדיין 0, בדוק את שטח הבנוי/קלט הנכס.");
  } else if (totalNearUsable > 0 || totalRadiusUsable > 0) {
    conclusion = "ADDRESS_RESOLUTION_MISMATCH";
    recommendedNextStep = "apply_city_normalization_fix";
    if (totalNearUsable > 0) notes.push(`קיימות ${totalNearUsable} ראיות שמישות תחת איות עיר שונה במעט מ-"${valCityRaw}".`);
    if (totalRadiusUsable > 0) notes.push(`קיימות ${totalRadiusUsable} ראיות שמישות ברדיוס ${RADIUS_M} מ' מהנכס — אך מסנן העיר המדויק מחריג אותן.`);
  } else if (mpsRowsUsableAnywhere && marketPropertySources.rowsScanned > 0) {
    conclusion = "PROVIDER_NOT_WIRED";
    recommendedNextStep = "wire_market_property_sources";
    notes.push(`קיימות ${marketPropertySources.rowsScanned} שורות ב-market_property_sources, אך אף ספק הערכה אינו קורא טבלה זו.`);
  } else if (totalExact > 0 || totalNear > 0) {
    conclusion = "MISSING_PRICE_OR_SQM";
    recommendedNextStep = "inspect_provider";
    notes.push("קיימות שורות באזור אך ללא מחיר/שטח שמיש לחישוב מחיר למ\"ר.");
  } else {
    conclusion = "DATA_GAP";
    recommendedNextStep = "import_data";
    notes.push("אין שורות שמישות באף מקור פנימי לאזור — נדרש ייבוא עסקאות/מודעות.");
  }

  return {
    valuationId,
    input: {
      city: input.city ?? null, cityNormalized: valCityNorm, neighborhood: input.neighborhood ?? null,
      propertyType: input.propertyType ?? null, rooms: input.rooms ?? null, sqm: input.builtSqm ?? null,
      latitude: subjLat, longitude: subjLng,
    },
    address,
    sources: { propertyTransactions, externalListings, properties, marketPropertySources, brokerSold },
    providerRun,
    wiringMap,
    cityNormalization: {
      valuationCityNormalized: valCityNorm,
      distinctTransactionCities: propertyTransactions.distinctCities,
      distinctListingCities: externalListings.distinctCities,
      likelyCityMismatches: allMismatches,
    },
    conclusion,
    recommendedNextStep,
    notes,
  };
}
