// ============================================================================
// 🧾 VAL-QA-10 — External Listings Scan Proof (READ-ONLY, server-only).
// ----------------------------------------------------------------------------
// PROVES whether a valuation actually scans real, persisted external_listings —
// never fakes rows, never invents comparables, never uses AI. It:
//   • times & counts every comparable provider (Part 1),
//   • reads external_listings defensively (select *) and computes the full
//     retrieval funnel: raw → city → normalized-city → price → sqm → both →
//     type → rooms → area → radius → usable → rejected (+ reasons) (Core),
//   • runs the REAL external provider and compares its raw-row count to the
//     table's row count to detect a provider that isn't reading the table,
//   • classifies the exact reason external listings are empty (Part 3),
//   • reports whether external listings were truly scanned & used (Part 4).
// No writes, no mutations, no formula/ranking/schema changes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { govmapProvider } from "./providers/govmap-provider";
import { taxAuthorityProvider } from "./providers/tax-authority-provider";
import { yad2Provider } from "./providers/yad2-provider";
import { madlanProvider } from "./providers/madlan-provider";
import { zonoInternalProvider } from "./providers/zono-internal-provider";
import { getBrokerSoldProperties } from "./providers";
import { rowToInput } from "./service";
import { normalizeInput } from "./valuation-engine";
import { normalizeCity } from "./diagnostics";
import type { ProviderContext, ProviderResult } from "./providers/types";
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

const RADIUS_M = 4000;
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type ExternalScanClassification =
  | "NO_EXTERNAL_LISTINGS_IMPORTED"
  | "EXTERNAL_PROVIDER_NOT_READING_TABLE"
  | "EXTERNAL_CITY_FILTER_MISMATCH"
  | "EXTERNAL_MISSING_PRICE_OR_SQM"
  | "EXTERNAL_COMPARABLES_NOT_USED"
  | "EXTERNAL_LISTINGS_OK";

// Per-provider timing + funnel (Part 1).
export interface ProviderTiming {
  provider: string;
  table: string;
  startedAt: string; finishedAt: string; durationMs: number;
  status: string; message: string | null;
  rawRowsRead: number;
  usableRows: number;
}

export interface ExternalFunnel {
  rawRowsInOrg: number;
  rowsAfterExactCity: number;
  rowsAfterNormalizedCity: number;
  rowsAfterPrice: number;
  rowsAfterSqm: number;
  rowsAfterPriceAndSqm: number;
  rowsAfterType: number;
  rowsAfterRooms: number;
  rowsAfterArea: number;
  rowsAfterRadius: number;
  usableRows: number;
  rejectedRows: number;
  rejectionReasons: { reason: string; count: number }[];
  distinctCities: string[];
}

export interface ValuationScanProof {
  valuationId: string;
  input: { city: string | null; cityNormalized: string; propertyType: string | null; rooms: number | null; sqm: number | null; hasCoordinates: boolean };
  timings: ProviderTiming[];
  external: ExternalFunnel;
  // Live provider read (proves the provider actually reads the table).
  externalProvider: { rawRowsRead: number; usableRows: number; status: string; message: string | null };
  externalUsedInValuation: number;   // rows persisted with source yad2/madlan
  externalScanned: boolean;          // provider actually returned rows from the table
  scanProofExists: boolean;          // this proof was produced from real reads
  classification: ExternalScanClassification;
  reasonHe: string;                  // exact human reason for the UI
  notes: string[];
}

/** Time one provider call and reduce it to a ProviderTiming. */
async function timeProvider(name: string, table: string, run: () => Promise<ProviderResult>): Promise<ProviderTiming> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  let res: ProviderResult;
  try { res = await run(); }
  catch (e) { res = { source: name, status: "error", comparables: [], message: e instanceof Error ? e.message : String(e) }; }
  const durationMs = Math.round(performance.now() - t0);
  return {
    provider: name, table, startedAt, finishedAt: new Date().toISOString(), durationMs,
    status: res.status, message: res.message ?? null,
    rawRowsRead: res.comparables.length,
    usableRows: res.comparables.filter((c) => (c.pricePerSqm ?? 0) > 0).length,
  };
}

const REASON_HE: Record<ExternalScanClassification, string> = {
  NO_EXTERNAL_LISTINGS_IMPORTED: "לא יובאו מודעות חיצוניות כלל לארגון — יש להריץ סנכרון מקורות (יד2/מדלן).",
  EXTERNAL_PROVIDER_NOT_READING_TABLE: "קיימות שורות ב-external_listings אך הספק לא קרא אף שורה — תקלת חיווט/סכמה בספק.",
  EXTERNAL_CITY_FILTER_MISMATCH: "קיימות מודעות אך אף אחת אינה בעיר/רדיוס של הנכס — פער איות עיר או פער גיאוגרפי.",
  EXTERNAL_MISSING_PRICE_OR_SQM: "קיימות מודעות בעיר אך ללא מחיר+שטח — לא ניתן לחשב מחיר למ״ר.",
  EXTERNAL_COMPARABLES_NOT_USED: "קיימות מודעות שמישות בעיר אך הן לא נכללו בהערכה — יש לבדוק את שילוב הספק בהערכה.",
  EXTERNAL_LISTINGS_OK: "מודעות חיצוניות נסרקו ונמצאו שמישות ונכללו בהערכה.",
};

/** Build the external-listings scan proof for one valuation. READ-ONLY. */
export async function buildValuationScanProof(valuationId: string): Promise<ValuationScanProof | null> {
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
  const subjLat = input.latitude ?? null, subjLng = input.longitude ?? null;
  const hasCoords = subjLat != null && subjLng != null;
  const ctx: ProviderContext = { db, orgId, input, limit: 80 };

  // ── Part 1 — time every provider individually ─────────────────────────────
  const [govmap, tax, yad2, madlan, zono] = await Promise.all([
    timeProvider("GovMap (property_transactions)", "property_transactions", () => govmapProvider(ctx)),
    timeProvider("רשות המסים (stub)", "tax_authority", () => taxAuthorityProvider(ctx)),
    timeProvider("Yad2 (external_listings)", "external_listings", () => yad2Provider(ctx)),
    timeProvider("Madlan (external_listings)", "external_listings", () => madlanProvider(ctx)),
    timeProvider("מלאי פנימי (properties)", "properties", () => zonoInternalProvider(ctx)),
  ]);
  const brokerTiming = await timeProvider("עסקאות המתווך (deals)", "deals", async () => {
    const bs = await getBrokerSoldProperties(db, orgId, input);
    return { source: "broker_sold", status: bs.length ? "ok" : "not_connected", comparables: bs.map((b) => ({ pricePerSqm: b.pricePerSqm ?? null })) as never };
  });
  const timings = [govmap, tax, yad2, madlan, zono, brokerTiming];

  // ── Core — read external_listings defensively and compute the funnel ──────
  let rows: Row[] | null = null; let readErr: string | null = null;
  for (const orgCol of ["org_id", "organization_id"]) {
    try {
      const { data, error } = await db.from("external_listings" as never).select("*").eq(orgCol, orgId).limit(8000);
      if (error) { readErr = error.message; continue; }
      rows = (data ?? []) as Row[]; readErr = null; break;
    } catch (e) { readErr = e instanceof Error ? e.message : String(e); }
  }
  const all = rows ?? [];
  const subjType = (input.propertyType ?? "").trim().toLowerCase();
  const subjRooms = input.rooms ?? null;
  const subjSqm = input.builtSqm ?? null;

  const distinct = new Set<string>();
  const reasons = new Map<string, number>();
  const bump = (r: string) => reasons.set(r, (reasons.get(r) ?? 0) + 1);
  let afterExactCity = 0, afterNormCity = 0, afterPrice = 0, afterSqm = 0, afterBoth = 0,
    afterType = 0, afterRooms = 0, afterArea = 0, afterRadius = 0, usable = 0, rejected = 0;

  for (const r of all) {
    const cityRaw = firstStr(r, ["city", "city_name"]);
    if (cityRaw) distinct.add(cityRaw);
    const price = firstNum(r, ["price", "asking_price", "amount"]);
    const sqm = firstNum(r, ["sqm", "area_sqm", "size_sqm", "area", "built_sqm"]);
    const type = firstStr(r, ["property_type", "type"]).toLowerCase();
    const rooms = firstNum(r, ["rooms"]);
    const rlat = firstNum(r, ["lat", "latitude"]), rlng = firstNum(r, ["lng", "longitude"]);
    const inRadius = hasCoords && rlat != null && rlng != null && haversine(subjLat!, subjLng!, rlat, rlng) <= RADIUS_M;

    const isExact = !!valCityRaw && cityRaw === valCityRaw;
    const isNorm = !!valCityNorm && normalizeCity(cityRaw) === valCityNorm;
    const hasPrice = !!price && price > 0;
    const hasSqm = !!sqm && sqm > 0;
    const both = hasPrice && hasSqm;

    if (isExact) afterExactCity++;
    if (isNorm) afterNormCity++;
    if (inRadius) afterRadius++;
    // Content filters counted over the in-city (normalized) set.
    if (isNorm) {
      if (hasPrice) afterPrice++;
      if (hasSqm) afterSqm++;
      if (both) afterBoth++;
      if (both && subjType && type === subjType) afterType++;
      if (both && subjRooms != null && rooms != null && Math.abs(rooms - subjRooms) <= 1) afterRooms++;
      if (both && subjSqm != null && sqm != null && Math.abs(sqm - subjSqm) / subjSqm <= 0.25) afterArea++;
    }

    const locOk = isNorm || inRadius;
    if (locOk && both) { usable++; continue; }
    rejected++;
    if (!locOk) bump("מחוץ לעיר/רדיוס");
    else if (!hasPrice) bump("ללא מחיר");
    else if (!hasSqm) bump("ללא שטח (מ״ר)");
    else bump("אחר");
  }

  const external: ExternalFunnel = {
    rawRowsInOrg: all.length,
    rowsAfterExactCity: afterExactCity, rowsAfterNormalizedCity: afterNormCity,
    rowsAfterPrice: afterPrice, rowsAfterSqm: afterSqm, rowsAfterPriceAndSqm: afterBoth,
    rowsAfterType: afterType, rowsAfterRooms: afterRooms, rowsAfterArea: afterArea,
    rowsAfterRadius: afterRadius, usableRows: usable, rejectedRows: rejected,
    rejectionReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    distinctCities: [...distinct].slice(0, 40),
  };

  // Live provider read = yad2 + madlan (both read external_listings).
  const providerRaw = yad2.rawRowsRead + madlan.rawRowsRead;
  const providerUsable = yad2.usableRows + madlan.usableRows;
  const externalProvider = {
    rawRowsRead: providerRaw, usableRows: providerUsable,
    status: yad2.status === "ok" || madlan.status === "ok" ? "ok" : (yad2.status === "error" || madlan.status === "error" ? "error" : "not_connected"),
    message: [yad2.message, madlan.message].filter(Boolean).join(" · ") || null,
  };

  // How many external comparables were actually persisted into the valuation.
  let externalUsedInValuation = 0;
  try {
    const { data } = await db.from("valuation_comparables" as never)
      .select("source").eq("valuation_id", valuationId).limit(500);
    externalUsedInValuation = ((data ?? []) as Row[]).filter((c) => ["yad2", "madlan"].includes(str(c.source))).length;
  } catch { /* best-effort */ }

  // ── Part 3 — classification ───────────────────────────────────────────────
  const notes: string[] = [];
  if (readErr) notes.push(`קריאת external_listings נכשלה: ${readErr}`);
  let classification: ExternalScanClassification;
  if (all.length === 0) classification = "NO_EXTERNAL_LISTINGS_IMPORTED";
  else if (providerRaw === 0) classification = "EXTERNAL_PROVIDER_NOT_READING_TABLE";
  else if (afterNormCity === 0 && afterRadius === 0) classification = "EXTERNAL_CITY_FILTER_MISMATCH";
  else if (afterBoth === 0 && afterRadius === 0) classification = "EXTERNAL_MISSING_PRICE_OR_SQM";
  else if (usable > 0 && externalUsedInValuation === 0 && providerUsable === 0) classification = "EXTERNAL_COMPARABLES_NOT_USED";
  else classification = "EXTERNAL_LISTINGS_OK";

  if (classification === "EXTERNAL_CITY_FILTER_MISMATCH" && afterExactCity === 0 && afterNormCity > 0)
    notes.push(`קיימות ${afterNormCity} מודעות תחת איות עיר מנורמל שונה מ-"${valCityRaw}".`);
  if (!hasCoords) notes.push("לנכס אין קואורדינטות — חיפוש רדיוס למודעות אינו זמין; ההתאמה מסתמכת על שם עיר.");

  return {
    valuationId,
    input: {
      city: input.city ?? null, cityNormalized: valCityNorm, propertyType: input.propertyType ?? null,
      rooms: subjRooms, sqm: subjSqm, hasCoordinates: hasCoords,
    },
    timings, external, externalProvider, externalUsedInValuation,
    externalScanned: providerRaw > 0,
    scanProofExists: true,
    classification, reasonHe: REASON_HE[classification], notes,
  };
}
