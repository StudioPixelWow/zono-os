// ============================================================================
// ZONO Property Radar™ — market area key (pure, deterministic).
// One canonical key per provider-agnostic geographic area, so the same city/
// neighborhood is scanned ONCE and shared. Normalizes spacing, lowercases Latin
// text, trims, and formats as: city:<city>  or  city:<city>|neighborhood:<hood>.
// ============================================================================

export interface MarketAreaKeyInput {
  city: string;
  neighborhood?: string | null;
}

function normalizeText(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ") // collapse internal whitespace
    .toLowerCase(); // lowercasing is a no-op for Hebrew, normalizes Latin
}

/** Deterministic shared-cache key for a (city[, neighborhood]) area. */
export function createMarketAreaKey(input: MarketAreaKeyInput): string {
  const city = normalizeText(input.city ?? "");
  if (!city) throw new Error("createMarketAreaKey: city is required");
  const neighborhood = normalizeText(input.neighborhood ?? "");
  return neighborhood ? `city:${city}|neighborhood:${neighborhood}` : `city:${city}`;
}
