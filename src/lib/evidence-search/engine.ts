// ============================================================================
// Evidence Search Engine™ — engine (server-only). Runs the progressive search,
// classifies each row's match level, ranks it, and assembles an EvidencePackage.
// READ-ONLY. Never calculates a valuation; never changes any formula.
// ============================================================================
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getBrokerSoldProperties } from "@/lib/valuation/providers";
import type { ValuationInput } from "@/lib/valuation/types";
import {
  normalizeCity, normalizeNeighborhood, normalizeStreet, normalizeHouseNumber,
  haversineMeters, firstStr, firstNum,
} from "./normalizers";
import { SOURCE_SPECS, fetchTableSource, type SourceSpec } from "./repository";
import { scoreEvidence } from "./ranking";
import { classifyFailure, recommendedStep } from "./explain";
import type {
  ResolvedAddress, EvidencePackage, EvidenceRow, SourceDiag, MatchLevel,
  Comparable, ComparableSource,
} from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

export interface EvidenceSubject { propertyType: string | null; rooms: number | null; sqm: number | null }
export interface EvidenceOptions { allowNearbyCities?: boolean }

/** Extract a real image URL from a string column or an images array — never fabricated. */
function firstImageUrl(row: Row, fields: string[]): string | null {
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

const KNOWN_SOURCES: ComparableSource[] = ["govmap", "tax_authority", "madlan", "yad2", "zono"];
function coerceSource(spec: SourceSpec, row: Row): ComparableSource {
  if (spec.comparableSource !== "from_row") return spec.comparableSource;
  const raw = firstStr(row, spec.sourceField).toLowerCase();
  return KNOWN_SOURCES.find((s) => raw.includes(s)) ?? "yad2";
}

interface MapInfo { distance: number | null; level: MatchLevel; sameCityExact: boolean; sameCityNorm: boolean; sameNeigh: boolean; inRadius: boolean }
function classify(addr: ResolvedAddress, city: string, neighborhood: string, street: string, lat: number | null, lng: number | null): MapInfo {
  const distance = addr.hasCoordinates && lat != null && lng != null && addr.latitude != null && addr.longitude != null
    ? Math.round(haversineMeters(addr.latitude, addr.longitude, lat, lng)) : null;
  const sameCityExact = !!addr.city && !!city && city.trim() === addr.city.trim();
  const sameCityNorm = !!addr.cityNormalized && normalizeCity(city) === addr.cityNormalized;
  const sameStreet = !!addr.streetNormalized && normalizeStreet(street) === addr.streetNormalized;
  const sameNeigh = !!addr.neighborhoodNormalized && normalizeNeighborhood(neighborhood) === addr.neighborhoodNormalized;
  const sameHouse = !!addr.houseNumber && normalizeHouseNumber(street) === addr.houseNumber;

  let level: MatchLevel;
  if ((distance != null && distance <= 30) || (sameStreet && sameHouse)) level = "building";
  else if (sameStreet || (distance != null && distance <= 120)) level = "street";
  else if (sameNeigh) level = "neighborhood";
  else if (distance != null && distance <= 300) level = "r300";
  else if (distance != null && distance <= 700) level = "r700";
  else if (distance != null && distance <= 1000) level = "r1000";
  else if (distance != null && distance <= 2000) level = "r2000";
  else if (sameCityExact || sameCityNorm) level = "city";
  else level = "nearby_city";

  return { distance, level, sameCityExact, sameCityNorm, sameNeigh, inRadius: distance != null && distance <= 2000 };
}

export async function runEvidenceSearch(
  db: DB, orgId: string, addr: ResolvedAddress, subject: EvidenceSubject, options: EvidenceOptions = {},
): Promise<EvidencePackage> {
  const allowNearbyCities = options.allowNearbyCities === true;
  const evidence: EvidenceRow[] = [];
  const sources: SourceDiag[] = [];
  const comparablesForValuation: Comparable[] = [];

  const pushUsable = (e: EvidenceRow, src: ComparableSource) => {
    comparablesForValuation.push({
      source: src, comparableType: e.comparableType, externalId: e.externalId,
      city: e.city, neighborhood: e.neighborhood, street: e.street, distanceMeters: e.distanceMeters,
      propertyType: e.propertyType, rooms: e.rooms, sqm: e.sqm, price: e.price, pricePerSqm: e.pricePerSqm,
      saleDate: e.saleDate, listingDate: e.listingDate,
      // Anti-fake traceability carried through to the AVM comparable.
      sourceTable: e.sourceTable, originalUrl: e.originalUrl, imageUrl: e.imageUrl, isTraceable: true,
    });
  };

  // ── Table sources (defensive, parallel) ────────────────────────────────────
  const fetches = await Promise.all(SOURCE_SPECS.map((spec) => fetchTableSource(db, orgId, spec)));
  SOURCE_SPECS.forEach((spec, idx) => {
    const { rows, error } = fetches[idx];
    const diag: SourceDiag = {
      source: spec.id, connected: error == null, wired: spec.wired, error,
      rawCount: rows.length, usableCount: 0, pricedCount: 0, sizedCount: 0,
      exactCityCount: 0, normalizedCityCount: 0, neighborhoodCount: 0,
      radiusCount: addr.hasCoordinates ? 0 : null, rejectedCount: 0, rejectionReasons: [],
    };
    for (const row of rows) {
      const city = firstStr(row, spec.cityFields), neighborhood = firstStr(row, spec.neighborhoodFields), street = firstStr(row, spec.streetFields);
      const lat = firstNum(row, spec.latFields), lng = firstNum(row, spec.lngFields);
      const price = firstNum(row, spec.priceFields), sqm = firstNum(row, spec.sqmFields);
      const ppsqmDirect = firstNum(row, spec.ppsqmFields);
      const ppsqm = ppsqmDirect && ppsqmDirect > 0 ? ppsqmDirect : (price && price > 0 && sqm && sqm > 0 ? Math.round(price / sqm) : null);
      const rooms = firstNum(row, spec.roomsFields);
      const propertyType = firstStr(row, spec.typeFields) || null;
      const info = classify(addr, city, neighborhood, street, lat, lng);

      if (price && price > 0) diag.pricedCount++;
      if (sqm && sqm > 0) diag.sizedCount++;
      if (info.sameCityExact) diag.exactCityCount++;
      if (info.sameCityNorm) diag.normalizedCityCount++;
      if (info.sameNeigh) diag.neighborhoodCount++;
      if (diag.radiusCount != null && info.inRadius) diag.radiusCount++;

      const ageMonths = (() => {
        const d = firstStr(row, [...spec.saleDateFields, ...spec.listingDateFields]);
        if (!d) return null;
        const m = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30);
        return Number.isFinite(m) && m >= 0 ? m : null;
      })();
      const sqmDiffPct = subject.sqm && sqm ? Math.abs(subject.sqm - sqm) / subject.sqm : null;
      const roomsDiff = subject.rooms != null && rooms != null ? Math.abs(subject.rooms - rooms) : null;
      const sameType = !!(subject.propertyType && propertyType) && subject.propertyType === propertyType;

      // ── Anti-fake HARD BLOCK (VAL-QA-6): a comparable is usable only if it
      //    traces to a real row (source id) AND has raw price AND raw sqm.
      const externalId = firstStr(row, spec.idFields) || null;
      const originalUrl = firstStr(row, spec.urlFields) || null;
      const imageUrl = firstImageUrl(row, spec.imageFields);
      const isTraceable = !!externalId && !!(price && price > 0) && !!(sqm && sqm > 0);
      let rejectionReason: string | null = null;
      if (!isTraceable) rejectionReason = "UNTRACEABLE_EVIDENCE";
      else if (info.level === "nearby_city" && !allowNearbyCities) rejectionReason = "עיר סמוכה (כבוי כברירת מחדל)";
      const usableForValuation = rejectionReason == null;
      if (usableForValuation) diag.usableCount++;
      else { diag.rejectedCount++; if (rejectionReason && !diag.rejectionReasons.includes(rejectionReason)) diag.rejectionReasons.push(rejectionReason); }

      const erow: EvidenceRow = {
        source: spec.id, sourceTable: spec.table, externalId, originalUrl, imageUrl, isTraceable,
        matchLevel: info.level, distanceMeters: info.distance,
        city: city || null, neighborhood: neighborhood || null, street: street || null, rooms, sqm,
        price: price && price > 0 ? price : null, pricePerSqm: ppsqm, propertyType, comparableType: spec.comparableType,
        saleDate: firstStr(row, spec.saleDateFields) || null, listingDate: firstStr(row, spec.listingDateFields) || null,
        confidence: scoreEvidence({ level: info.level, distanceMeters: info.distance, sameType, roomsDiff, sqmDiffPct, ageMonths, source: spec.id, comparableType: spec.comparableType, hasPrice: !!(price && price > 0), hasSqm: !!(sqm && sqm > 0) }),
        reason: `${spec.id} · ${info.level}${info.distance != null ? ` · ${info.distance}מ׳` : ""}`,
        usableForValuation, rejectionReason,
      };
      evidence.push(erow);
      if (usableForValuation) pushUsable(erow, coerceSource(spec, row));
    }
    sources.push(diag);
  });

  // ── Broker sold (won deals) — reuse the existing read-only provider ─────────
  const valInput = addrToValuationInput(addr, subject);
  const brokerDiag: SourceDiag = {
    source: "broker_sold", connected: true, wired: true, error: null,
    rawCount: 0, usableCount: 0, pricedCount: 0, sizedCount: 0, exactCityCount: 0,
    normalizedCityCount: 0, neighborhoodCount: 0, radiusCount: addr.hasCoordinates ? 0 : null, rejectedCount: 0, rejectionReasons: [],
  };
  try {
    const sold = await getBrokerSoldProperties(db, orgId, valInput);
    brokerDiag.rawCount = sold.length;
    for (const b of sold) {
      const hasCoord = b.distanceMeters != null;
      const info = classify(addr, b.city ?? "", b.neighborhood ?? "", b.street ?? "", hasCoord ? addr.latitude : null, hasCoord ? addr.longitude : null);
      const externalId = b.dealId ?? b.propertyId ?? null;
      const isTraceable = !!externalId && !!(b.salePrice && b.salePrice > 0) && !!(b.sqm && b.sqm > 0);
      const usable = isTraceable && (info.level !== "nearby_city" || allowNearbyCities);
      if (b.salePrice && b.salePrice > 0) brokerDiag.pricedCount++;
      if (b.sqm && b.sqm > 0) brokerDiag.sizedCount++;
      if (info.sameCityExact) brokerDiag.exactCityCount++;
      if (info.sameCityNorm) brokerDiag.normalizedCityCount++;
      if (diag2Radius(brokerDiag) && info.inRadius) brokerDiag.radiusCount = (brokerDiag.radiusCount ?? 0) + 1;
      if (usable) brokerDiag.usableCount++; else { brokerDiag.rejectedCount++; const rr = !isTraceable ? "UNTRACEABLE_EVIDENCE" : "עיר סמוכה (כבוי כברירת מחדל)"; if (!brokerDiag.rejectionReasons.includes(rr)) brokerDiag.rejectionReasons.push(rr); }

      const erow: EvidenceRow = {
        source: "broker_sold", sourceTable: "deals", externalId, originalUrl: null, imageUrl: b.imageUrl ?? null, isTraceable,
        matchLevel: info.level, distanceMeters: b.distanceMeters ?? null,
        city: b.city ?? null, neighborhood: b.neighborhood ?? null, street: b.street ?? null, rooms: b.rooms ?? null, sqm: b.sqm ?? null,
        price: b.salePrice ?? null, pricePerSqm: b.pricePerSqm ?? null, propertyType: null, comparableType: "sold",
        saleDate: b.saleDate ?? null, listingDate: null,
        confidence: scoreEvidence({ level: info.level, distanceMeters: b.distanceMeters ?? null, sameType: false, roomsDiff: null, sqmDiffPct: null, ageMonths: null, source: "broker_sold", comparableType: "sold", hasPrice: !!(b.salePrice && b.salePrice > 0), hasSqm: !!(b.sqm && b.sqm > 0) }),
        reason: `broker_sold · ${info.level}`, usableForValuation: usable, rejectionReason: usable ? null : (isTraceable ? "עיר סמוכה" : "UNTRACEABLE_EVIDENCE"),
      };
      evidence.push(erow);
      if (usable) pushUsable(erow, "zono");
    }
  } catch (e) { brokerDiag.connected = false; brokerDiag.error = e instanceof Error ? e.message : String(e); }
  sources.push(brokerDiag);

  // ── Assemble ────────────────────────────────────────────────────────────────
  const usableEvidence = evidence.filter((e) => e.usableForValuation);
  const matchLevelsUsed = [...new Set(usableEvidence.map((e) => e.matchLevel))];
  const counts = {
    totalRows: evidence.length, usable: usableEvidence.length,
    priced: sources.reduce((n, s) => n + s.pricedCount, 0),
    sized: sources.reduce((n, s) => n + s.sizedCount, 0),
    sameCity: sources.reduce((n, s) => n + s.exactCityCount, 0),
    normalizedCity: sources.reduce((n, s) => n + s.normalizedCityCount, 0),
    radius: sources.reduce((n, s) => n + (s.radiusCount ?? 0), 0),
  };

  const mps = sources.find((s) => s.source === "market_property_sources");
  const mpsUsableButUnwired = !!mps && !mps.wired && !mps.error && mps.pricedCount > 0 && mps.sizedCount > 0
    && sources.filter((s) => s.wired).every((s) => s.usableCount === 0);

  const failureMode = classifyFailure({
    hasCity: !!addr.city, cityResolved: !!addr.cityNormalized, hasCoordinates: addr.hasCoordinates,
    totalRows: counts.totalRows, pricedRows: counts.priced, sizedRows: counts.sized, usableRows: counts.usable,
    sameCityRows: counts.sameCity, normalizedCityRows: counts.normalizedCity, radiusRows: counts.radius,
    mpsUsableButUnwired, anySourceError: sources.some((s) => s.wired && s.error != null),
  });

  return {
    resolvedAddress: addr, coordinatesStatus: addr.hasCoordinates ? "present" : "missing",
    allowNearbyCities, sources, evidence, comparablesForValuation, matchLevelsUsed, counts,
    failureMode, recommendedNextStep: recommendedStep(failureMode),
  };
}

const diag2Radius = (d: SourceDiag) => d.radiusCount != null;

function addrToValuationInput(addr: ResolvedAddress, subject: EvidenceSubject): ValuationInput {
  return {
    city: addr.city, neighborhood: addr.neighborhood, street: addr.street,
    houseNumber: addr.houseNumber, apartmentNumber: null,
    latitude: addr.latitude, longitude: addr.longitude,
    propertyType: subject.propertyType, rooms: subject.rooms, builtSqm: subject.sqm,
    balconySqm: null, gardenSqm: null, floor: null, totalFloors: null, elevator: null,
    parkingCount: null, storage: null, mamad: null, renovated: null,
    propertyCondition: null, viewQuality: null, noiseLevel: null, buildingYear: null, notes: null,
  } as ValuationInput;
}
