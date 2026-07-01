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
  normalizeCity, normalizeNeighborhood, normalizeStreet, normalizeHouseNumber, firstStr, firstNum,
} from "./normalizers";
import { distanceOrNull, radiusBucket } from "./distance";
import { computeSimilarity } from "./similarity";
import { computeQuality, buildMatchReasons } from "./quality";
import { dedupeCandidates } from "./dedupe";
import { fetchAllSourceRows, type SourceSpec } from "./repository";
import { buildSelectionExplanation, classifyFailure } from "./explain";
import {
  RADIUS_LADDER, DEFAULT_MAX_RADIUS_M, EXPANDED_MAX_RADIUS_M, SOURCE_PRIORITY,
  MIN_STRONG_COMPARABLES, MIN_TOTAL_COMPARABLES, STRONG_SIMILARITY, DISCOVERY_ENGINE_VERSION,
  type Candidate, type DiscoverySubject, type DiscoverySourceId, type MatchLevel,
  type SourceScanStat, type RadiusStat, type ComparableDiscoveryPackage,
} from "./types";

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
/** Tri-state boolean read: true / false / null (unknown). */
function boolField(row: Record<string, unknown>, fields: string[]): boolean | null {
  for (const f of fields) {
    const v = row[f];
    if (v == null || v === "") continue;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v > 0;
    const t = s(v).trim().toLowerCase();
    if (["true", "yes", "כן", "1", "y"].includes(t)) return true;
    if (["false", "no", "לא", "0", "n"].includes(t)) return false;
  }
  return null;
}

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
  const totalFloors = firstNum(row, ["total_floors", "building_floors", "floors"]);
  const parking = firstNum(row, ["parking", "parking_count", "parking_spots"]);
  const storage = boolField(row, ["storage", "storeroom", "מחסן"]);
  const balcony = firstNum(row, ["balcony_sqm", "balcony", "מרפסת"]);
  const elevator = boolField(row, ["elevator", "has_elevator", "מעלית"]);
  const condition = firstStr(row, ["condition", "property_condition", "renovated"]) || null;
  const buildingYear = firstNum(row, ["building_year", "built_year", "year_built"]);
  const houseNumber = normalizeHouseNumber(firstStr(row, ["house_number", "building_number"]) || street || "");
  const propertyType = firstStr(row, spec.typeFields) || null;
  const sourceId = firstStr(row, spec.idFields) || null;
  const saleDate = firstStr(row, spec.saleDateFields) || null;
  const listingDate = firstStr(row, spec.listingDateFields) || null;

  const distance = distanceOrNull(subj.latitude, subj.longitude, lat, lng);
  const level = matchLevelOf(subj, city ?? "", distance);
  const hasPrice = !!price && price > 0, hasSqm = !!sqm && sqm > 0;
  const isTraceable = !!sourceId && hasPrice && hasSqm;

  const candNeighNorm = normalizeNeighborhood(neighborhood);
  const sameNeighborhood = !!subj.neighborhoodNormalized && candNeighNorm === subj.neighborhoodNormalized;
  const differentKnownNeighborhood = !!subj.neighborhoodNormalized && !!candNeighNorm && candNeighNorm !== subj.neighborhoodNormalized;
  const sameStreet = !!subj.streetNormalized && normalizeStreet(street) === subj.streetNormalized;
  const sameBuilding = (sameStreet && !!subj.houseNumber && houseNumber === subj.houseNumber) || (distance != null && distance <= 40);
  const candType = (propertyType ?? "").trim().toLowerCase();
  const sameType = !!subj.propertyTypeNormalized && !!candType && candType === subj.propertyTypeNormalized;
  const roomsDiff = subj.rooms != null && rooms != null ? Math.abs(subj.rooms - rooms) : null;
  const sqmDiffPct = subj.sqm != null && subj.sqm > 0 && sqm != null ? Math.abs(subj.sqm - sqm) / subj.sqm : null;
  const floorDiff = subj.floor != null && floor != null ? Math.abs(subj.floor - floor) : null;
  const totalFloorsDiff = subj.totalFloors != null && totalFloors != null ? Math.abs(subj.totalFloors - totalFloors) : null;
  const yearDiff = subj.buildingYear != null && buildingYear != null ? Math.abs(subj.buildingYear - buildingYear) : null;
  const sameConstructionPeriod = yearDiff != null && yearDiff <= 3;
  const bothNum = (a: number | null, b: number | null) => a != null && b != null;
  const parkingMatch = bothNum(subj.parking, parking) ? ((subj.parking ?? 0) > 0) === ((parking ?? 0) > 0) : null;
  const storageMatch = subj.storage != null && storage != null ? subj.storage === storage : null;
  const balconyMatch = bothNum(subj.balcony, balcony) ? ((subj.balcony ?? 0) > 0) === ((balcony ?? 0) > 0) : null;
  const elevatorMatch = subj.elevator != null && elevator != null ? subj.elevator === elevator : null;
  const conditionMatch = subj.condition && condition ? subj.condition.trim().toLowerCase() === condition.trim().toLowerCase() : null;
  const ageMonths = ageMonthsOf(saleDate ?? listingDate);

  const similarityScore = computeSimilarity({
    matchLevel: level, distanceMeters: distance, sameNeighborhood, differentKnownNeighborhood, sameStreet, sameBuilding,
    sameConstructionPeriod, sameType, hasType: !!candType, roomsDiff, sqmDiffPct, floorDiff, totalFloorsDiff,
    parkingMatch, storageMatch, balconyMatch, elevatorMatch, conditionMatch, luxuryMatch: null, yearDiff,
    ageMonths, source: spec.id as DiscoverySourceId, hasPrice, hasSqm, isTraceable,
  });

  const usable = isTraceable && level !== "out";
  let rejectionReason: string | null = null;
  if (!sourceId) rejectionReason = "ללא מזהה עקיב (sourceId)";
  else if (!hasPrice) rejectionReason = "ללא מחיר";
  else if (!hasSqm) rejectionReason = "ללא שטח (מ״ר)";
  else if (level === "out") rejectionReason = "מחוץ לעיר/רדיוס";

  const cand: Candidate = {
    source: spec.id as DiscoverySourceId, sourceTable: spec.table, sourceId,
    provider: firstStr(row, spec.sourceField) || null, comparableSource: coerceSource(spec, row),
    comparableType: spec.comparableType, city, neighborhood, street,
    latitude: lat, longitude: lng, distanceMeters: distance,
    rooms, sqm, floor, buildingYear,
    price: hasPrice ? price : null, pricePerSqm: ppsqm, propertyType, saleDate, listingDate,
    imageUrl: firstImage(row, spec.imageFields), originalUrl: firstStr(row, spec.urlFields) || null,
    similarityScore, radiusBucket: radiusBucket(distance), matchLevel: level,
    isTraceable, usable, sameType, matchReasons: [], rejectionReason, duplicateRefs: [],
  };
  cand.matchReasons = buildMatchReasons(subj, cand, { sameBuilding, sameNeighborhood, sameConstructionPeriod });
  return cand;
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
  const sameNeighborhood = !!subj.neighborhoodNormalized && normalizeNeighborhood(b.neighborhood ?? null) === subj.neighborhoodNormalized;
  const sameStreet = !!subj.streetNormalized && normalizeStreet(b.street ?? null) === subj.streetNormalized;
  const sameBuilding = distance != null && distance <= 40;
  const similarityScore = computeSimilarity({
    matchLevel: level, distanceMeters: distance, sameNeighborhood, differentKnownNeighborhood: false, sameStreet,
    sameBuilding, sameConstructionPeriod: false, sameType: false, hasType: false,
    roomsDiff, sqmDiffPct, floorDiff: null, totalFloorsDiff: null,
    parkingMatch: null, storageMatch: null, balconyMatch: null, elevatorMatch: null, conditionMatch: null, luxuryMatch: null,
    yearDiff: null, ageMonths: ageMonthsOf(b.saleDate ?? null), source: "broker_sold", hasPrice, hasSqm, isTraceable,
  });
  const usable = isTraceable && level !== "out";
  let rejectionReason: string | null = null;
  if (!sourceId) rejectionReason = "ללא מזהה עקיב (sourceId)";
  else if (!hasPrice) rejectionReason = "ללא מחיר";
  else if (!hasSqm) rejectionReason = "ללא שטח (מ״ר)";
  else if (level === "out") rejectionReason = "מחוץ לעיר/רדיוס";
  const cand: Candidate = {
    source: "broker_sold", sourceTable: "deals", sourceId, provider: "broker_sold", comparableSource: "zono",
    comparableType: "sold", city, neighborhood: b.neighborhood ?? null, street: b.street ?? null,
    latitude: null, longitude: null, distanceMeters: distance,
    rooms: b.rooms ?? null, sqm: b.sqm ?? null, floor: null, buildingYear: null,
    price: hasPrice ? b.salePrice ?? null : null, pricePerSqm: b.pricePerSqm ?? null,
    propertyType: null, saleDate: b.saleDate ?? null, listingDate: null,
    imageUrl: b.imageUrl ?? null, originalUrl: null,
    similarityScore, radiusBucket: radiusBucket(distance), matchLevel: level,
    isTraceable, usable, sameType: false, matchReasons: [], rejectionReason, duplicateRefs: [],
  };
  cand.matchReasons = buildMatchReasons(subj, cand, { sameBuilding, sameNeighborhood, sameConstructionPeriod: false });
  return cand;
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
  const perRadius = RADIUS_LADDER.map((r) => ({ radiusM: r, count: cands.filter((c) => c.distanceMeters != null && c.distanceMeters <= r).length }));
  return {
    source, table, wired, startedAt, finishedAt, durationMs, error,
    rawRowsScanned: raw, cityMatch, normalizedCityMatch: normCity,
    within500m: w500, within1km: w1k, within2km: w2k, within3km: w3k, within4km: w4k, perRadius,
    withPrice, withSqm, withPriceAndSqm: both, usableRows: usable, rejectedRows: rejected,
    rejectionReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

const inRing = (c: Candidate, ring: number): boolean =>
  c.matchLevel === "same_city" || c.matchLevel === "normalized_city"
    ? true : c.matchLevel === "radius" ? (c.radiusBucket != null && c.radiusBucket <= ring) : false;

/** Professional selection ranking: similarity → source priority → distance. */
function rankSelect(a: Candidate, b: Candidate): number {
  return b.similarityScore - a.similarityScore
    || SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
    || (a.distanceMeters ?? 1e9) - (b.distanceMeters ?? 1e9);
}

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

  // ── Concentric selection (Part 2/4): expand ring by ring; prefer same-type;
  //    stop once enough high-quality comparables exist. 4km only when thin.
  const defaultMax = options.maxRadiusM ?? DEFAULT_MAX_RADIUS_M;
  const usableAll = kept.filter((c) => c.usable);
  const gateType = !!subject.propertyTypeNormalized;
  const typePool = gateType ? usableAll.filter((c) => c.sameType) : usableAll;
  const ringsUpToDefault = RADIUS_LADDER.filter((r) => r <= defaultMax);

  let maxRadiusUsedM = defaultMax;
  let chosen: Candidate[] | null = null;
  for (const ring of ringsUpToDefault) {
    const p = typePool.filter((c) => inRing(c, ring));
    const strongN = p.filter((c) => c.similarityScore >= STRONG_SIMILARITY).length;
    if (strongN >= MIN_STRONG_COMPARABLES && p.length >= MIN_TOTAL_COMPARABLES) { maxRadiusUsedM = ring; chosen = p; break; }
  }
  if (!chosen && !options.maxRadiusM) { maxRadiusUsedM = EXPANDED_MAX_RADIUS_M; chosen = typePool.filter((c) => inRing(c, EXPANDED_MAX_RADIUS_M)); }
  else if (!chosen) { maxRadiusUsedM = defaultMax; chosen = typePool.filter((c) => inRing(c, defaultMax)); }

  // Type gating fallback (Part 4): mix other types ONLY when same-type is insufficient.
  let mixedTypes = false;
  if (gateType && chosen.length < MIN_TOTAL_COMPARABLES) {
    const mixed = usableAll.filter((c) => inRing(c, maxRadiusUsedM));
    if (mixed.length > chosen.length) { chosen = mixed; mixedTypes = true; }
  }

  const sel = [...chosen].sort(rankSelect).slice(0, 24);
  const strong = sel.filter((c) => c.similarityScore >= STRONG_SIMILARITY).length;
  const selectedComparables = sel.map(toComparable);
  const quality = computeQuality(sel);

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
    sourceStats, radiusStats, candidatePool: kept, selected: sel, selectedComparables, quality, mixedTypes,
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
