// ============================================================================
// ZONO Property Radar™ — Apify actor input builders (isolated, easy to edit).
// Conservative, generic inputs: extra keys an actor ignores are harmless, and
// the runtime never breaks if the actor's schema differs. Tune here as the real
// actor schemas are confirmed.
// ============================================================================
import type { PropertyProviderScanOptions, PropertyRadarArea } from "./types";

function baseInput(area: PropertyRadarArea, options?: PropertyProviderScanOptions) {
  const maxPages = Math.max(1, options?.maxPages ?? 1);
  return {
    city: area.city,
    // Many IL scrapers accept any of these location aliases.
    locality: area.city,
    location: area.neighborhood ? `${area.city} ${area.neighborhood}` : area.city,
    ...(area.neighborhood ? { neighborhood: area.neighborhood } : {}),
    maxPages,
    // newest-first when supported (ignored otherwise).
    sort: "date",
    order: "desc",
    // "for sale" — actors commonly key this as dealType/transactionType.
    dealType: "buy",
    transactionType: "sale",
  };
}

/** TODO: confirm the exact Yad2 actor input schema and tighten fields. */
export function buildYad2ActorInput(
  area: PropertyRadarArea,
  options?: PropertyProviderScanOptions,
): Record<string, unknown> {
  return { ...baseInput(area, options), source: "yad2" };
}

/** TODO: confirm the exact Madlan actor input schema and tighten fields. */
export function buildMadlanActorInput(
  area: PropertyRadarArea,
  options?: PropertyProviderScanOptions,
): Record<string, unknown> {
  return { ...baseInput(area, options), source: "madlan" };
}
