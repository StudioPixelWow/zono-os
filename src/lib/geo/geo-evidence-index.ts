// ============================================================================
// ZONO GEO — Internal-first resolution (PURE, LEAF).
// ----------------------------------------------------------------------------
// The core of "don't pay a provider for what we already know": an in-memory index
// of REAL geocoded evidence (external_listings + geocoded transactions/properties)
// plus the persisted cache, resolved by canonical key. Resolution order matches
// the spec: cache → exact address → same street → same neighborhood → same city →
// (only then) external provider. Coordinates are never invented — a bucket only
// exists because a real geocoded row fed it. City/neighborhood matches carry a
// coarse resolution and so can never unlock a precise (R300/R700/street) tier.
//
// PURE: operates on plain data (index + cache map). The DB scan that fills the
// index and the provider fallback live in the server pipeline; keeping resolution
// here makes it unit-testable and offline.
// ============================================================================
import type { GeoResolution } from "./address";
import { resolutionRank } from "./address";
import {
  buildCacheKeyCandidates, writeKeyForResolution,
  type CacheKeyParts, type CacheKeyType,
} from "./geo-cache-key";

export interface Coord { lat: number; lng: number }

interface Centroid { sumLat: number; sumLng: number; n: number }

export interface EvidenceIndex {
  exact: Map<string, Coord>;        // one representative building point
  street: Map<string, Centroid>;
  neighborhood: Map<string, Centroid>;
  city: Map<string, Centroid>;
}

export function createEvidenceIndex(): EvidenceIndex {
  return { exact: new Map(), street: new Map(), neighborhood: new Map(), city: new Map() };
}

function addCentroid(m: Map<string, Centroid>, key: string, c: Coord): void {
  const cur = m.get(key);
  if (cur) { cur.sumLat += c.lat; cur.sumLng += c.lng; cur.n += 1; }
  else m.set(key, { sumLat: c.lat, sumLng: c.lng, n: 1 });
}

/** Feed one real geocoded evidence point into every bucket its address supports.
 *  A street-level point contributes to its street, neighborhood and city centroids. */
export function addEvidencePoint(index: EvidenceIndex, parts: CacheKeyParts, coord: Coord): void {
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) return;
  for (const cand of buildCacheKeyCandidates(parts)) {
    if (cand.keyType === "exact") { if (!index.exact.has(cand.key)) index.exact.set(cand.key, coord); }
    else if (cand.keyType === "street") addCentroid(index.street, cand.key, coord);
    else if (cand.keyType === "neighborhood") addCentroid(index.neighborhood, cand.key, coord);
    else addCentroid(index.city, cand.key, coord);
  }
}

function centroidOf(m: Map<string, Centroid>, key: string): Coord | null {
  const c = m.get(key);
  if (!c || c.n <= 0) return null;
  return { lat: c.sumLat / c.n, lng: c.sumLng / c.n };
}

export type InternalSource =
  | "internal_cache" | "internal_exact" | "internal_street"
  | "internal_neighborhood" | "internal_city";

export interface InternalMatch {
  lat: number;
  lng: number;
  resolution: GeoResolution;
  source: InternalSource;
  /** The key + granularity this coordinate should be CACHED under (never finer
   *  than its resolution). */
  writeKey: string;
  writeKeyType: CacheKeyType;
}

export interface CachedCoord { lat: number; lng: number; resolution: GeoResolution; provider: string }

/** Try the persisted cache first — finest candidate key that is present wins. */
export function resolveFromCache(cache: Map<string, CachedCoord>, parts: CacheKeyParts): InternalMatch | null {
  for (const cand of buildCacheKeyCandidates(parts)) {
    const hit = cache.get(cand.key);
    if (hit) {
      return {
        lat: hit.lat, lng: hit.lng, resolution: hit.resolution,
        source: "internal_cache", writeKey: cand.key, writeKeyType: cand.keyType,
      };
    }
  }
  return null;
}

/** Resolve from the in-memory evidence index (no cache, no provider). Finest
 *  granularity that has evidence wins; exact address uses the building point, the
 *  rest use the centroid of the real points in that bucket. Exact/street matches
 *  are STREET-precise (never claim ROOFTOP from a copied point); neighborhood and
 *  city stay coarse. */
export function resolveFromEvidence(index: EvidenceIndex, parts: CacheKeyParts): InternalMatch | null {
  for (const cand of buildCacheKeyCandidates(parts)) {
    if (cand.keyType === "exact") {
      const p = index.exact.get(cand.key);
      if (p) return mk(p, "STREET", "internal_exact", parts);
    } else if (cand.keyType === "street") {
      const p = centroidOf(index.street, cand.key);
      if (p) return mk(p, "STREET", "internal_street", parts);
    } else if (cand.keyType === "neighborhood") {
      const p = centroidOf(index.neighborhood, cand.key);
      if (p) return mk(p, "NEIGHBORHOOD", "internal_neighborhood", parts);
    } else {
      const p = centroidOf(index.city, cand.key);
      if (p) return mk(p, "CITY", "internal_city", parts);
    }
  }
  return null;
}

function mk(coord: Coord, resolution: GeoResolution, source: InternalSource, parts: CacheKeyParts): InternalMatch {
  const wk = writeKeyForResolution(parts, resolution);
  return {
    lat: coord.lat, lng: coord.lng, resolution, source,
    writeKey: wk?.key ?? "", writeKeyType: wk?.keyType ?? "city",
  };
}

/** Full internal resolution: cache first, then real evidence. null → the caller
 *  must fall back to the external provider (the only path that costs money). */
export function resolveInternal(
  index: EvidenceIndex, cache: Map<string, CachedCoord>, parts: CacheKeyParts,
): InternalMatch | null {
  return resolveFromCache(cache, parts) ?? resolveFromEvidence(index, parts);
}

/** True when an incoming resolution should replace an existing one (never
 *  downgrade a precise coordinate). Mirrors address.shouldReplaceCoordinate but
 *  on plain resolutions for cache/evidence bookkeeping. */
export function outranks(incoming: GeoResolution, existing: GeoResolution | null | undefined): boolean {
  return resolutionRank(incoming) > resolutionRank(existing);
}
