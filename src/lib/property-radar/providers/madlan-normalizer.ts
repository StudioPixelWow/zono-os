// ============================================================================
// ZONO Property Radar™ — Madlan normalizer (pure, defensive). Maps raw actor
// items into the radar's normalized shapes. Missing fields stay undefined.
// Isolated per provider so Madlan-specific quirks can be tuned independently.
// ============================================================================
import { normalizeRawToDetails, normalizeRawToMetadata } from "./normalize";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "./types";

type Raw = Record<string, unknown>;

export function normalizeMadlanMetadata(raw: Raw): NormalizedListingMetadata {
  return normalizeRawToMetadata("madlan", raw);
}

export function normalizeMadlanDetails(raw: Raw): NormalizedListingDetails {
  return normalizeRawToDetails("madlan", raw);
}
