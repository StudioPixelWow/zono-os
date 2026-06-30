// ============================================================================
// ZONO Price Intelligence — READ-ONLY valuation evidence diagnostic.
// ----------------------------------------------------------------------------
// diagnoseValuationEvidence(valuationId) proves WHY a valuation has no evidence:
//   • real data gap          (no rows in the area at all)
//   • city-name mismatch     (rows exist under a different spelling)
//   • missing price/sqm       (rows exist but no usable price-per-sqm)
//   • provider wiring/schema  (a provider errors — e.g. selects a missing column)
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
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c) // final letters → base form
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface SourceDiag {
  exactCityCount: number;
  exactCityUsableCount: number;
  nearCityMatches: number;
  usableNearCityMatches: number;
  rowsScanned: number;
  distinctCities: string[];
  likelyMismatches: string[];   // raw city strings that normalize-equal but differ from the exact value
  queryError: string | null;
}

export interface ValuationEvidenceDiagnosis {
  valuationId: string;
  input: {
    city: string | null; cityNormalized: string; neighborhood: string | null;
    propertyType: string | null; rooms: number | null; sqm: number | null;
    latitude: number | null; longitude: number | null;
  };
  sources: {
    propertyTransactions: SourceDiag;
    externalListings: SourceDiag;
    properties: SourceDiag;
    brokerSold: { count: number; usableCount: number; queryError: string | null };
  };
  providerRun: { source: string; status: string; message: string | null; count: number; usableCount: number }[];
  cityNormalization: {
    valuationCityNormalized: string;
    distinctTransactionCities: string[];
    distinctListingCities: string[];
    likelyCityMismatches: string[];
  };
  conclusion: "DATA_GAP" | "CITY_NORMALIZATION_MISMATCH" | "MISSING_PRICE_OR_SQM" | "PROVIDER_NOT_WIRED" | "UNKNOWN";
  recommendedNextStep: "import_data" | "apply_city_normalization_fix" | "wire_market_property_sources" | "inspect_provider" | "none";
  notes: string[];
}

const SCAN_LIMIT = 8000;

interface TableSpec { table: string; orgCol: string; cityFields: string[]; priceFields: string[]; sqmFields: string[]; ppsqmFields: string[] }

/** Read a table (select * → defensive against unknown columns) and tally evidence. */
async function analyzeTable(
  db: Awaited<ReturnType<typeof createClient>>, orgId: string, spec: TableSpec,
  valCityRaw: string, valCityNorm: string,
): Promise<SourceDiag> {
  const empty: SourceDiag = {
    exactCityCount: 0, exactCityUsableCount: 0, nearCityMatches: 0, usableNearCityMatches: 0,
    rowsScanned: 0, distinctCities: [], likelyMismatches: [], queryError: null,
  };
  try {
    const { data, error } = await db.from(spec.table as never).select("*").eq(spec.orgCol, orgId).limit(SCAN_LIMIT);
    if (error) return { ...empty, queryError: error.message };
    const rows = (data ?? []) as Row[];
    let exact = 0, exactUsable = 0, near = 0, nearUsable = 0;
    const distinct = new Set<string>();
    const mism = new Set<string>();
    for (const row of rows) {
      const cityRaw = firstStr(row, spec.cityFields);
      const price = firstNum(row, spec.priceFields);
      const sqm = firstNum(row, spec.sqmFields);
      const ppsqmDirect = firstNum(row, spec.ppsqmFields);
      const ppsqm = ppsqmDirect && ppsqmDirect > 0 ? ppsqmDirect : (price && sqm && sqm > 0 ? price / sqm : null);
      const usable = !!ppsqm && ppsqm > 0;
      if (cityRaw) distinct.add(cityRaw);
      const isExact = !!valCityRaw && cityRaw === valCityRaw;
      const isNear = !!valCityNorm && normalizeCity(cityRaw) === valCityNorm;
      if (isExact) { exact++; if (usable) exactUsable++; }
      if (isNear) { near++; if (usable) nearUsable++; }
      if (isNear && !isExact && cityRaw) mism.add(cityRaw);
    }
    return {
      exactCityCount: exact, exactCityUsableCount: exactUsable,
      nearCityMatches: near, usableNearCityMatches: nearUsable,
      rowsScanned: rows.length, distinctCities: [...distinct].slice(0, 40),
      likelyMismatches: [...mism].slice(0, 20), queryError: null,
    };
  } catch (e) {
    return { ...empty, queryError: e instanceof Error ? e.message : String(e) };
  }
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
  const input: ValuationInput = normalizeInput(rowToInput(valRow as Row));
  const valCityRaw = (input.city ?? "").trim();
  const valCityNorm = normalizeCity(input.city);

  // ── Source tables (defensive select *; never errors on a missing column) ────
  const [propertyTransactions, externalListings, properties] = await Promise.all([
    analyzeTable(db, orgId, {
      table: "property_transactions", orgCol: "organization_id",
      cityFields: ["city_name", "city"], priceFields: ["deal_amount", "price"],
      sqmFields: ["sqm", "area", "deal_area", "built_area"], ppsqmFields: ["price_per_sqm"],
    }, valCityRaw, valCityNorm),
    analyzeTable(db, orgId, {
      table: "external_listings", orgCol: "org_id",
      cityFields: ["city", "city_name"], priceFields: ["price", "asking_price"],
      sqmFields: ["sqm", "area_sqm", "size_sqm", "area"], ppsqmFields: ["price_per_sqm"],
    }, valCityRaw, valCityNorm),
    analyzeTable(db, orgId, {
      table: "properties", orgCol: "org_id",
      cityFields: ["city", "city_name"], priceFields: ["price", "asking_price"],
      sqmFields: ["size_sqm", "sqm", "area"], ppsqmFields: ["price_per_sqm"],
    }, valCityRaw, valCityNorm),
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

  // ── Conclusion ──────────────────────────────────────────────────────────────
  const notes: string[] = [];
  const tableErrors = [propertyTransactions, externalListings, properties].filter((t) => t.queryError);
  const providerErrors = providerRun.filter((p) => p.status === "error");
  const totalExact = propertyTransactions.exactCityCount + externalListings.exactCityCount + properties.exactCityCount;
  const totalExactUsable = propertyTransactions.exactCityUsableCount + externalListings.exactCityUsableCount + properties.exactCityUsableCount;
  const totalNear = propertyTransactions.nearCityMatches + externalListings.nearCityMatches + properties.nearCityMatches;
  const totalNearUsable = propertyTransactions.usableNearCityMatches + externalListings.usableNearCityMatches + properties.usableNearCityMatches;
  const allMismatches = [...new Set([...propertyTransactions.likelyMismatches, ...externalListings.likelyMismatches, ...properties.likelyMismatches])];

  for (const p of providerErrors) notes.push(`ספק "${p.source}" מחזיר שגיאה: ${p.message ?? "—"}`);
  for (const t of tableErrors) notes.push(`שאילתת טבלה נכשלה: ${t.queryError}`);
  if (!input.city) notes.push('להערכה אין עיר — לא ניתן לאתר ראיות (חסר קלט "עיר").');
  if (!input.builtSqm || input.builtSqm <= 0) notes.push('להערכה חסר שטח בנוי במ"ר — גם עם ראיות, השווי לא יחושב.');

  let conclusion: ValuationEvidenceDiagnosis["conclusion"];
  let recommendedNextStep: ValuationEvidenceDiagnosis["recommendedNextStep"];

  if (providerErrors.length > 0 || tableErrors.length > 0) {
    // A provider/table errors (e.g. selecting a column that doesn't exist) even
    // though rows may physically exist — this is a wiring/schema problem.
    conclusion = "PROVIDER_NOT_WIRED";
    recommendedNextStep = "inspect_provider";
    if (totalExactUsable > 0 || totalNearUsable > 0) notes.push("יש שורות שמישות בטבלה, אך הספק לא הצליח לקרוא אותן — תקלת חיווט/סכמה ולא חוסר נתונים.");
  } else if (totalExactUsable > 0) {
    conclusion = "UNKNOWN";
    recommendedNextStep = "none";
    notes.push("נמצאו ראיות שמישות בעיר המדויקת — ההערכה אמורה להתקבל. אם עדיין 0, בדוק את שטח הבנוי/קלט הנכס.");
  } else if (totalNearUsable > 0) {
    conclusion = "CITY_NORMALIZATION_MISMATCH";
    recommendedNextStep = "apply_city_normalization_fix";
    notes.push(`קיימות ${totalNearUsable} ראיות שמישות תחת איות עיר שונה במעט מ-"${valCityRaw}".`);
  } else if (totalExact > 0 || totalNear > 0) {
    conclusion = "MISSING_PRICE_OR_SQM";
    recommendedNextStep = "inspect_provider";
    notes.push("קיימות שורות באזור אך ללא מחיר/שטח שמיש לחישוב מחיר למ\"ר.");
  } else {
    conclusion = "DATA_GAP";
    recommendedNextStep = "import_data";
    // If external_listings table is entirely empty/absent, market sources may be unwired.
    if (externalListings.rowsScanned === 0 && propertyTransactions.rowsScanned === 0) {
      notes.push("אין שורות עסקאות/מודעות כלל לארגון — נדרש ייבוא נתוני שוק. אם מקור המודעות אמור להזין אוטומטית, ייתכן שצריך לחבר את market_property_sources.");
    }
  }

  return {
    valuationId,
    input: {
      city: input.city ?? null, cityNormalized: valCityNorm, neighborhood: input.neighborhood ?? null,
      propertyType: input.propertyType ?? null, rooms: input.rooms ?? null, sqm: input.builtSqm ?? null,
      latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    },
    sources: { propertyTransactions, externalListings, properties, brokerSold },
    providerRun,
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
