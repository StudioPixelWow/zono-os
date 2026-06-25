// ============================================================================
// ZONO Property Radar™ — field validation (pure, never throws).
// Required: provider, externalId, city, listingType. Optional fields may be
// absent without rejecting. Missing required → the listing is rejected (skipped),
// but the sync continues with the rest.
// ============================================================================
import type { FieldValidationResult, NormalizedListingMetadata } from "./types";

const REQUIRED = ["provider", "externalId", "city", "listingType"] as const;
const OPTIONAL = [
  "neighborhood", "street", "rooms", "floor", "sizeSqm", "imageUrl",
  "phone", "contactName", "publishedAt", "providerUpdatedAt",
] as const;

const KNOWN_PROVIDERS = ["mock", "yad2", "madlan"];
const KNOWN_LISTING_TYPES = ["private", "broker", "project", "unknown"];

function present(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Validate required + optional fields for a normalized listing. Pure. */
export function validateListingFields(
  listing: Partial<NormalizedListingMetadata> | null | undefined,
): FieldValidationResult {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const errors: string[] = [];

  if (!listing || typeof listing !== "object") {
    return { valid: false, missingRequired: [...REQUIRED], missingOptional: [], errors: ["listing missing"] };
  }
  const l = listing as Record<string, unknown>;

  for (const f of REQUIRED) if (!present(l[f])) missingRequired.push(f);
  for (const f of OPTIONAL) if (!present(l[f])) missingOptional.push(f);

  if (present(l.provider) && !KNOWN_PROVIDERS.includes(String(l.provider))) {
    errors.push(`unknown provider "${String(l.provider)}"`);
  }
  if (present(l.listingType) && !KNOWN_LISTING_TYPES.includes(String(l.listingType))) {
    errors.push(`unknown listingType "${String(l.listingType)}"`);
  }

  if (missingRequired.length) errors.push(`missing required: ${missingRequired.join(", ")}`);

  // Reject ONLY when a required field is missing — optional gaps never reject.
  return { valid: missingRequired.length === 0, missingRequired, missingOptional, errors };
}
