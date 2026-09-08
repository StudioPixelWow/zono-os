// ============================================================================
// ZONO Property Radar™ — external listing source normalizer (pure, defensive). Maps raw actor items
// into the radar's normalized shapes. Missing fields stay undefined — never faked.
// Isolated per provider so external listing source-specific quirks can be tuned independently.
// ============================================================================
import { normalizeRawToDetails, normalizeRawToMetadata } from "./normalize";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "./types";

type Raw = Record<string, unknown>;

export function normalizeYad2Metadata(raw: Raw): NormalizedListingMetadata {
  return normalizeRawToMetadata("yad2", raw);
}

export function normalizeYad2Details(raw: Raw): NormalizedListingDetails {
  return normalizeRawToDetails("yad2", raw);
}
