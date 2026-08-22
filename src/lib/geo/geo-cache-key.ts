// ============================================================================
// ZONO GEO — Canonical CACHE KEY derivation (PURE, LEAF, dependency-light).
// ----------------------------------------------------------------------------
// Turns an address into the normalized keys under which a coordinate is cached /
// looked up, so the SAME real location resolves to the SAME key regardless of how
// it was written. Reuses the canonical locality engine (Hebrew⇄English:
// "קרית ביאליק" ≡ "Kiryat Bialik") — proven necessary by live data where sold
// transactions were Hebrew and asking listings English. No provider calls here;
// unit-testable.
//
// Four granularities, finest → coarsest, each with the FINEST resolution it can
// justify. A city/neighborhood key can never carry a STREET/ROOFTOP resolution
// (§2 — a centroid must never unlock R300/R700/same-street).
// ============================================================================
import { canonicalLocality, canonicalNeighborhood, foldLocality } from "./locality";
import type { GeoResolution } from "./address";
import { resolutionRank } from "./address";

export type CacheKeyType = "exact" | "street" | "neighborhood" | "city";

export interface CacheKeyParts {
  city?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  neighborhood?: string | null;
}

export interface CacheKeyCandidate {
  key: string;
  keyType: CacheKeyType;
  /** The finest resolution this key granularity can justify. */
  resolution: GeoResolution;
}

/** The finest resolution each key granularity is ALLOWED to represent. */
const RESOLUTION_FOR_TYPE: Record<CacheKeyType, GeoResolution> = {
  exact: "ROOFTOP",
  street: "STREET",
  neighborhood: "NEIGHBORHOOD",
  city: "CITY",
};

export function resolutionForKeyType(t: CacheKeyType): GeoResolution {
  return RESOLUTION_FOR_TYPE[t];
}

/** Fold a street name to a comparison form: drop a trailing house number
 *  ("לוטם 2" and "לוטם 5" fold to the same street) and canonicalize spelling. */
export function foldStreet(street: string | null | undefined): string | null {
  const raw = (street ?? "").trim();
  if (!raw) return null;
  // strip a trailing number (and any decimal/letter suffix): "לוטם 2.0 א" → "לוטם"
  const nameOnly = raw.replace(/[0-9].*$/, "").trim();
  const folded = foldLocality(nameOnly || raw);
  return folded || null;
}

/** Extract a bare house number from a street/number field ("לוטם 2.0" → "2"). */
export function houseNumber(streetNumber: string | null | undefined, street?: string | null): string | null {
  const fromNum = (streetNumber ?? "").match(/\d+/)?.[0] ?? null;
  if (fromNum) return fromNum;
  const fromStreet = (street ?? "").match(/(\d+)/)?.[1] ?? null;
  return fromStreet;
}

/**
 * All cache-key candidates for an address, FINEST → COARSEST. A lookup should try
 * them in order and take the first cache hit; a write should use the candidate
 * matching the resolution actually obtained (see writeKeyForResolution). Returns
 * [] when there is not even a city to key on (nothing to cache honestly).
 */
export function buildCacheKeyCandidates(parts: CacheKeyParts): CacheKeyCandidate[] {
  const city = canonicalLocality(parts.city);
  if (!city) return []; // without a city we cannot form a stable key
  const street = foldStreet(parts.street);
  const num = street ? houseNumber(parts.streetNumber, parts.street) : null;
  const nbhd = canonicalNeighborhood(parts.neighborhood);

  const out: CacheKeyCandidate[] = [];
  if (street && num) out.push({ key: `exact:${city}|${street}|${num}`, keyType: "exact", resolution: "ROOFTOP" });
  if (street) out.push({ key: `street:${city}|${street}`, keyType: "street", resolution: "STREET" });
  if (nbhd) out.push({ key: `neighborhood:${city}|${nbhd}`, keyType: "neighborhood", resolution: "NEIGHBORHOOD" });
  out.push({ key: `city:${city}`, keyType: "city", resolution: "CITY" });
  return out;
}

/**
 * The key under which a coordinate obtained at `resolution` should be STORED:
 * the finest candidate whose granularity does not over-claim the resolution.
 * A CITY-resolution result is never stored under a street/exact key, so it can
 * never later be served as a precise coordinate. Returns null if the parts can't
 * form any key.
 */
export function writeKeyForResolution(parts: CacheKeyParts, resolution: GeoResolution): CacheKeyCandidate | null {
  const candidates = buildCacheKeyCandidates(parts);
  if (candidates.length === 0) return null;
  const cap = resolutionRank(resolution);
  // finest candidate whose implied resolution is not finer than what we actually got
  for (const c of candidates) {
    if (resolutionRank(c.resolution) <= cap) return c;
  }
  // everything is finer than the result (e.g. CITY result but only an exact key
  // was built — impossible since candidates always include city) → coarsest.
  return candidates[candidates.length - 1];
}
