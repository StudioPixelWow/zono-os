// ============================================================================
// ZONO Property Radar™ — per-listing QA report assembler (pure).
// Combines field validation + normalization QA into one report object used by
// the engine and the admin QA screen (raw payload, normalized payload,
// validation, quality score, errors/warnings).
// ============================================================================
import { validateListingFields } from "./validator";
import { runNormalizationQA } from "./normalizer-check";
import type {
  ListingQAReport,
  NormalizedListingDetails,
  NormalizedListingMetadata,
} from "./types";

export function assembleListingQAReport(
  listing: NormalizedListingMetadata | NormalizedListingDetails,
): ListingQAReport {
  const field = validateListingFields(listing);
  const normalization = runNormalizationQA(listing);
  return {
    provider: listing.provider,
    externalId: listing.externalId ?? null,
    accepted: field.valid, // rejected only when a required field is missing
    field,
    normalization,
    rawPayload: (listing.rawMetadata ?? {}) as Record<string, unknown>,
    normalizedPayload: listing,
  };
}
