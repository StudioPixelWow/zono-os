// ============================================================================
// 🧭 Comparable Discovery Engine™ — engine (server-only). VAL-QA-10.
// ----------------------------------------------------------------------------
// Scans EVERY evidence source every time (GovMap never short-circuits external
// listings), maps rows → candidates with per-source + per-radius scan proof,
// dedupes across sources, ranks by similarity, applies the radius policy
// (default 3km, 4km only when evidence is thin), and selects the top TRACEABLE
// usable comparables for the AVM. Never calculates a valuation; never changes a
// formula; never fabricates a row.
// ============================================================================
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getBrokerSoldProperties } from "../providers";
import type { Comparable, ComparableSource, ValuationInput } from "../types";
import {
  normalizeCity, normalizeNeighborhood, normalizeStreet, firstStr, firstNum,
} from "./normalizers";
import { distanceOrNull, radiusBucket } from "./distance";
import { computeSimilarity } from "./similarity";
import { dedupeCandidates } from "./dedupe";
import { fetchAllSourceRows, type SourceSpec } from "./repository";
import { buildSelectionExplanation, classifyFailure } from "./explain";
import {
  RADIUS_LADDER, DEFAULT_MAX_RADIUS_M, EXPANDED_MAX_RADIUS_M,
  MIN_STRONG_COMPARABLES, MIN_TOTAL_COMPARABLES, STRONG_SIMILARITY, DISCOVERY_ENGINE_VERSION,
  type Candidate, type DiscoverySubject, type DiscoverySourceId, type MatchLevel,
  type SourceScanStat, type RadiusStat, type ComparableDiscoveryPackage,
} from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

const KNOWN_SOURCES: ComparableSource[] = ["govmap", "tax_authority", "madlan", "yad2", "zono"];
function coerceSource(spec: SourceSpec, row: Row): ComparableSource {
  if (spec.comparableSource !== "from_row") return spec.comparableSource;
  const raw = firstStr(row, spec.sourceField).toLowerCase();
  return KNOWN_SOURCES.find((s) => raw.includes(s)) ?? "yad2";
}
function firstImage(row: Row, fields: string[]): string | null {
  for (const f of fields) {
    const v = row[f];
    if (typeof v === "string" && v) return v;
    if (Array.isArray(v) && v.length) {
      const x = v[0];
      if (typeof x === "string" && x) return x;
      if (x && typeof x === "object" && "url" in x) return String((x as { url: unknown }).url);
    }
  }
  return null;
}

function matchLevelOf(subj: DiscoverySubject, cityRaw: string, distance: number | null): MatchLevel {
  if (subj.city && cityRaw && cityRaw.trim() === subj.city.trim()) return "same_city";
  if (subj.cityNormalized && normalizeCity(cityRaw) === subj.cityNormalized) return "normalized_city";
  if (distance != null && distance <= RADIUS_LADDER[RADIUS_LADDER.length - 1]) return "radius";
  return "out";
}

function ageMonthsOf(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const m = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30);
  return Number.isFinite(m) && m >= 0 ? m : null;
}

/** Map one raw row → a fully-scored Candidate. */
function toCandidate(spec: SourceSpec, row: Row, subj: DiscoverySubject): Candidate {
  const city = firstStr(row, spec.cityFields) || null;
  const neighborhood = firstStr(row, spec.neighborhoodFields) || null;
  const street = firstStr(row, spec.streetFields) || null;
  const lat = firstNum(row, spec.latFields), lng = firstNum(row, spec.lngFields);
  const price = firstNum(row, spec.priceFields);
  const sqm = firstNum(row, spec.sqmFields);
  const ppsqmDirect = firstNum(row, spec.ppsqmFields);
  const ppsqm = ppsqmDirect && ppsqmDirect > 0 ? ppsqmDirect : (price && price > 0 && sqm && sqm > 0 ? Math.round(price / sqm) : null);
  const rooms = firstNum(row, spec.roomsFields);
  const floor = firstNum(row, ["floor"]);
  const propertyType = firstStr(row, spec.typeFields) || null;
  const sourceId = firstStr(row, spec.idFields) || null;
  const saleDate = firstStr(row, spec.saleDateFields) || null;
  const listingDate = firstStr(row, spec.listingDateFields) || null;

  const distance = distanceOrNull(subj.latitude, subj.longitude, lat, lng);
  const level = matchLevelOf(subj, city ?? "", distance);
  const hasPrice = !!price && price > 0, hasSqm = !!sqm && sqm > 0;
  const isTraceable = !!sourceId && hasPrice && hasSqm;

  const sameNeighborhood = !!subj.neighborhoodNormalized && normalizeNeighborhood(neighborhood) === subj.neighborhoodNormalized;
  const sameStreet = !!subj.streetNormalized && normalizeStreet(street) === subj.streetNormalized;
  const subjType = (subj.propertyType ?? "").trim().toLowerCase();
  const candType = (propertyType ?? "").trim().toLowerCase();
  const sameType = !!subjType && !!candType && subjType === candType;
  const roomsDiff = subj.rooms != null && rooms != null ? Math.abs(subj.rooms - rooms) : null;
  const sqmDiffPct = subj.sqm != null && subj.sqm > 0 && sqm != null ? Math.abs(subj.sqm - sqm) / subj.sqm : null;
  const floorDiff = subj.floor != null && floor != null ? Math.abs(subj.floor - floor) : null;
  const ageMonths = ageMonthsOf(saleDate ?? listingDate);

  const similarityScore = computeSimilarity({
    matchLevel: level, distanceMeters: distance, sameNeighborhood, sameStreet, sameType, hasType: !!candType,
    roomsDiff, sqmDiffPct, floorDiff, ageMonths, source: spec.id as DiscoverySourceId, hasPrice, hasSqm, isTraceable,
  });

  const usable = isTraceable && level !== "out";
  let rejectionReason: string | null = null;
  if (!sourceId) rejectionReason = "ללא מזהה עקיב (sourceId)";
  else if (!hasPrice) rejectionReason = "ללא מחיר";
  else if (!hasSqm) rejectionReason = "ללא שטח (מ״ר)";
  else if (level === "out") rejectionReason = "מחוץ לעיר/רדיוס";

  return {
    source: spec.id as DiscoverySourceId, sourceTable: spec.table, sourceId,
    provider: firstStr(row, spec.sourceField) || null, comparableSource: coerceSource(spec, row),
    comparableType: spec.comparableType, city, neighborhood, street,
    latitude: lat, longitude: lng, distanceMeters: distance,
    rooms, sqm, floor, buildingYear: firstNum(row, ["building_year", "built_year"]),
    price: hasPrice ? price : null, pricePerSqm: ppsqm, propertyType, saleDate, listingDate,
    imageUrl: firstImage(row, spec.imageFields), originalUrl: firstStr(row, spec.urlFields) || null,
    similarityScore, radiusBucket: radiusBucket(distance), matchLevel: level,
    isTraceable, usable, rejectionReason, duplicateRefs: [],
  };
}

/** broker_sold candidates via the existing read-only provider. */
function brokerSoldToCandidate(b: Awaited<ReturnType<typeof getBrokerSoldProperties>>[number], subj: DiscoverySubject): Candidate {
  const city = b.city ?? null;
  const distance = b.distanceMeters ?? null;
  const level = matchLevelOf(subj, city ?? "", distance);
  const hasPrice = !!b.salePrice && b.salePrice > 0, hasSqm = !!b.sqm && b.sqm > 0;
  const sourceId = b.dealId ?? b.propertyId ?? null;
  const isTraceable = !!sourceId && hasPrice && hasSqm;
  const roomsDiff = subj.rooms != null && b.rooms != null ? Math.abs(subj.rooms - b.rooms) : null;
  const sqmDiffPct = subj.sqm != null && subj.sqm > 0 && b.sqm != null ? Math.abs(subj.sqm - b.sqm) / subj.sqm : null;
  const similarityScore = computeSimilarity({
    matchLevel: level, distanceMeters: distance, sameNeighborhood: false, sameStreet: false, sameType: false, hasType: false,
    roomsDiff, sqmDiffPct, floorDiff: null, ageMonths: ageMonthsOf(b.saleDate ?? null),
    source: "broker_sold", hasPrice, hasSqm, isTraceable,
  });
  const usable = isTraceable && level !== "out";
  let rejectionReason: string | null = null;
  if (!sourceId) rejectionReason = "ללא מזהה עקיב (sourceId)";
  else if (!hasPrice) rejectionReason = "ללא מחיר";
  else if (!hasSqm) rejectionReason = "ללא שטח (מ״ר)";
  else if (level === "out") rejectionReason = "מחוץ לעיר/רדיוס";
  return {
    source: "broker_sold", sourceTable: "deals", sourceId, provider: "broker_sold", comparableSource: "zono",
    comparableType: "sold", city, neighborhood: b.neighborhood ?? null, street: b.street ?? null,
    latitude: null, longitude: null, distanceMeters: distance,
    rooms: b.rooms ?? null, sqm: b.sqm ?? null, floor: null, buildingYear: null,
    price: hasPrice ? b.salePrice ?? null : null, pricePerSqm: b.pricePerSqm ?? null,
    propertyType: null, saleDate: b.saleDate ?? null, listingDate: null,
    imageUrl: b.imageUrl ?? null, originalUrl: null,
    similarityScore, radiusBucket: radiusBucket(distance), matchLevel: level,
    isTraceable, usable, rejectionReason, duplicateRefs: [],
  };
}

function toComparable(c: Candidate): Comparable {
  return {
    source: c.comparableSource, comparableType: c.comparableType, externalId: c.sourceId,
    city: c.city, neighborhood: c.neighborhood, street: c.street, distanceMeters: c.distanceMeters,
    propertyType: c.propertyType, rooms: c.rooms, sqm: c.sqm, floor: c.floor, buildingYear: c.buildingYear,
    price: c.price, pricePerSqm: c.pricePerSqm, saleDate: c.saleDate, listingDate: c.listingDate,
    similarityScore: c.similarityScore, imageUrl: c.imageUrl, originalUrl: c.originalUrl,
    sourceTable: c.sourceTable, isTraceable: true,
  };
}

function funnel(source: DiscoverySourceId, table: string, wired: boolean, cands: Candidate[], raw: number,
  startedAt: string, finishedAt: string, durationMs: number, error: string | null): SourceScanStat {
  const reasons = new Map<string, number>();
  let cityMatch = 0, normCity = 0, w500 = 0, w1k = 0, w2k = 0, w3k = 0, w4k = 0, withPrice = 0, withSqm = 0, both = 0, usable = 0, rejected = 0;
  for (const c of cands) {
    if (c.matchLevel === "same_city") cityMatch++;
    if (c.matchLevel === "same_city" || c.matchLevel === "normalized_city") normCity++;
    const d = c.distanceMeters;
    if (d != null) { if (d <= 500) w500++; if (d <= 1000) w1k++; if (d <= 2000) w2k++; if (d <= 3000) w3k++; if (d <= 4000) w4k++; }
    if (c.price != null) withPrice++;
    if (c.sqm != null) withSqm++;
    if (c.price != null && c.sqm != null) both++;
    if (c.usable) usable++;
    else { rejected++; const r = c.rejectionReason ?? "אחר"; reasons.set(r, (reasons.get(r) ?? 0) + 1); }
  }
  return {
    source, table, wired, startedAt, finishedAt, durationMs, error,
    rawRowsScanned: raw, cityMatch, normalizedCityMatch: normCity,
    within500m: w500, within1km: w1k, within2km: w2k, within3km: w3k, within4km: w4k,
    withPrice, withSqm, withPriceAndSqm: both, usableRows: usable, rejectedRows: rejected,
    rejectionReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

const inChosen = (c: Candidate, maxM: number): boolean =>
  c.matchLevel === "same_city" || c.matchLevel === "normalized_city"
    ? true : c.matchLevel === "radius" ? (c.radiusBucket != null && c.radiusBucket <= maxM) : false;

export interface DiscoveryOptions { maxRadiusM?: number }

/** Run comparable discovery for a resolved subject. Best-effort, no-throw. */
export async function runComparableDiscovery(
  db: DB, orgId: string, subject: DiscoverySubject, options: DiscoveryOptions = {},
): Promise<ComparableDiscoveryPackage> {
  const t0 = performance.now();

  // ── Scan ALL sources (always — GovMap never short-circuits external) ──────
  const fetches = await fetchAllSourceRows(db, orgId);
  const bsStart = new Date().toISOString(); const bt0 = performance.now();
  let brokerRows: Awaited<ReturnType<typeof getBrokerSoldProperties>> = [];
  let brokerErr: string | null = null;
  try { brokerRows = await getBrokerSoldProperties(db, orgId, subjectToInput(subject)); }
  catch (e) { brokerErr = e instanceof Error ? e.message : String(e); }
  const bsFinish = new Date().toISOString(); const bsMs = Math.round(performance.now() - bt0);

  const sourceStats: SourceScanStat[] = [];
  const allCandidates: Candidate[] = [];

  for (const f of fetches) {
    const cands = f.rows.map((r) => toCandidate(f.spec, r, subject));
    allCandidates.push(...cands);
    sourceStats.push(funnel(f.spec.id as DiscoverySourceId, f.spec.table, f.spec.wired, cands, f.rows.length, f.startedAt, f.finishedAt, f.durationMs, f.error));
  }
  const brokerCands = brokerRows.map((b) => brokerSoldToCandidate(b, subject));
  allCandidates.push(...brokerCands);
  sourceStats.push(funnel("broker_sold", "deals", true, brokerCands, brokerRows.length, bsStart, bsFinish, bsMs, brokerErr));

  // ── Dedupe across sources (keep strongest traceable) ──────────────────────
  const { kept, duplicatesRemoved } = dedupeCandidates(allCandidates);

  // ── Radius policy: default 3km; escalate to 4km only when thin ────────────
  let maxRadiusUsedM = options.maxRadiusM ?? DEFAULT_MAX_RADIUS_M;
  const usableWithin = (maxM: number) => kept.filter((c) => c.usable && inChosen(c, maxM));
  let sel = usableWithin(maxRadiusUsedM);
  let strong = sel.filter((c) => c.similarityScore >= STRONG_SIMILARITY).length;
  if ((strong < MIN_STRONG_COMPARABLES || sel.length < MIN_TOTAL_COMPARABLES) && maxRadiusUsedM < EXPANDED_MAX_RADIUS_M && !options.maxRadiusM) {
    maxRadiusUsedM = EXPANDED_MAX_RADIUS_M;
    sel = usableWithin(maxRadiusUsedM);
    strong = sel.filter((c) => c.similarityScore >= STRONG_SIMILARITY).length;
  }
  sel = [...sel].sort((a, b) => b.similarityScore - a.similarityScore).slice(0, 24);
  const selectedComparables = sel.map(toComparable);

  // ── Radius stats over candidates with coordinates ─────────────────────────
  const radiusStats: RadiusStat[] = RADIUS_LADDER.map((r) => ({
    radiusM: r,
    found: kept.filter((c) => c.radiusBucket != null && c.radiusBucket <= r).length,
    usable: kept.filter((c) => c.usable && c.radiusBucket != null && c.radiusBucket <= r).length,
  }));

  // ── Totals + flags + failure mode + explanation ───────────────────────────
  const traceable = kept.filter((c) => c.isTraceable).length;
  const usable = kept.filter((c) => c.usable).length;
  const rawScanned = sourceStats.reduce((n, s) => n + s.rawRowsScanned, 0);
  const externalStat = sourceStats.find((s) => s.source === "external_listings");
  const externalScanned = (externalStat?.rawRowsScanned ?? 0) > 0;
  const externalUsed = sel.some((c) => c.sourceTable === "external_listings" || c.sourceTable === "market_property_sources");
  const onlyOfficial = sel.length > 0 && sel.every((c) => c.sourceTable === "property_transactions");

  const failureMode = classifyFailure({ candidates: kept.length, traceable, usable, selected: sel.length, rawScanned });
  const selectionExplanation = buildSelectionExplanation({
    subject, selected: sel, maxRadiusUsedM, expandedBeyondDefault: maxRadiusUsedM > DEFAULT_MAX_RADIUS_M,
    strong, externalScanned, externalUsed, onlyOfficial, sourceStats, failureMode,
  });

  return {
    subject, coordinatesStatus: subject.hasCoordinates ? "present" : "missing",
    maxRadiusUsedM, expandedBeyondDefault: maxRadiusUsedM > DEFAULT_MAX_RADIUS_M,
    sourceStats, radiusStats, candidatePool: kept, selectedComparables,
    totals: { rawScanned, candidates: kept.length, duplicatesRemoved, traceable, usable, selected: sel.length, strongSelected: strong },
    flags: { everySourceScanned: sourceStats.length >= 5, externalScanned, externalUsed, onlyOfficial },
    selectionExplanation, failureMode,
    timings: { totalMs: Math.round(performance.now() - t0) },
    version: DISCOVERY_ENGINE_VERSION,
  };
}

/** Minimal ValuationInput for the broker-sold provider (distance/city only). */
function subjectToInput(subj: DiscoverySubject): ValuationInput {
  return {
    city: subj.city, neighborhood: subj.neighborhood, street: subj.street,
    houseNumber: null, apartmentNumber: null, latitude: subj.latitude, longitude: subj.longitude,
    propertyType: subj.propertyType, rooms: subj.rooms, builtSqm: subj.sqm,
    balconySqm: null, gardenSqm: null, floor: subj.floor, totalFloors: null, elevator: null,
    parkingCount: null, storage: null, mamad: null, renovated: null,
    propertyCondition: null, viewQuality: null, noiseLevel: null, buildingYear: subj.buildingYear, notes: null,
  } as ValuationInput;
}
