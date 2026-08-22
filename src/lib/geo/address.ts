// ============================================================================
// ZONO — Canonical geocoding ADDRESS builder + resolution model (PURE, LEAF).
// ----------------------------------------------------------------------------
// ONE place that decides (a) the best address query to hand the canonical
// geocoder (src/lib/maps/geocoding.ts), and (b) how precise the resulting
// coordinate is — so a CITY centroid can NEVER be mistaken for a ROOFTOP
// coordinate (AVM 3.2 §2/§6). No provider calls here; dependency-free and
// unit-testable. Never fabricates precision.
// ============================================================================

/** Precision of a stored coordinate, coarsest → finest. */
export type GeoResolution = "ROOFTOP" | "STREET" | "NEIGHBORHOOD" | "CITY" | "UNRESOLVED";

const ORDER: GeoResolution[] = ["UNRESOLVED", "CITY", "NEIGHBORHOOD", "STREET", "ROOFTOP"];
export function resolutionRank(r: GeoResolution | null | undefined): number {
  return r ? Math.max(0, ORDER.indexOf(r)) : 0;
}

/** Distance tiers (building/street/≤300m) require a precise coordinate. A city or
 *  neighborhood centroid must not produce a "300m comparable" (§9). */
export function isPreciseResolution(r: GeoResolution | null | undefined): boolean {
  return resolutionRank(r) >= resolutionRank("STREET");
}

export interface GeoAddressParts {
  street?: string | null;
  streetNumber?: string | null;
  buildingNumber?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  address?: string | null;   // free-form address if present
  title?: string | null;     // last-resort hint (property title)
}

/** Structured input for the canonical geocoder, using the best available hierarchy:
 *  street+number → neighborhood → address/title hint → city. Also returns the
 *  FINEST resolution the input could possibly yield (the geocoder result can only
 *  be equal or coarser — never finer than the address supports). */
export function buildGeoQuery(p: GeoAddressParts): { street: string | null; streetNumber: string | null; neighborhood: string | null; city: string | null; address: string | null; maxResolution: GeoResolution } {
  const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ") || null;
  // A transaction street often arrives as "לוטם 2.0" — split name + number.
  const rawStreet = clean(p.street);
  const streetName = rawStreet ? rawStreet.replace(/\s*\d[\d.]*\s*$/, "").trim() || null : null;
  const numFromStreet = rawStreet ? (rawStreet.match(/(\d+)/)?.[1] ?? null) : null;
  // A building number is only meaningful WITH a street name — a bare number geocodes
  // to nothing useful.
  const streetNumber = streetName ? (clean(p.streetNumber) || clean(p.buildingNumber) || numFromStreet) : null;
  const neighborhood = clean(p.neighborhood);
  const city = clean(p.city);
  // Only a real free-form ADDRESS is used as the query address — NEVER the property
  // title (a marketing string like "דירה 4 חדרים משופצת" makes Google return
  // ZERO_RESULTS, which is why street-less subjects were failing to geocode).
  const address = clean(p.address);

  let maxResolution: GeoResolution;
  if (streetName && streetNumber) maxResolution = "ROOFTOP";
  else if (streetName || address) maxResolution = "STREET";
  else if (neighborhood) maxResolution = "NEIGHBORHOOD";
  else if (city) maxResolution = "CITY";
  else maxResolution = "UNRESOLVED";

  return { street: streetName, streetNumber, neighborhood, city, address, maxResolution };
}

/** Final resolution = the coarser of what the address supports and what the
 *  provider's confidence implies. Never claims more precision than either allows. */
export function resolveGeoResolution(maxResolution: GeoResolution, providerConfidence: number | null | undefined): GeoResolution {
  const c = providerConfidence ?? 0;
  const byConfidence: GeoResolution = c >= 0.9 ? "ROOFTOP" : c >= 0.7 ? "STREET" : c >= 0.5 ? "NEIGHBORHOOD" : c > 0 ? "CITY" : "UNRESOLVED";
  // take the coarser (lower rank) of the two
  return resolutionRank(byConfidence) <= resolutionRank(maxResolution) ? byConfidence : maxResolution;
}

/** True when a NEW result should overwrite an existing coordinate: only when the
 *  existing one is missing or strictly coarser (never downgrade a precise coord). */
export function shouldReplaceCoordinate(existing: GeoResolution | null | undefined, incoming: GeoResolution): boolean {
  if (!existing || existing === "UNRESOLVED") return true;
  return resolutionRank(incoming) > resolutionRank(existing);
}
