// ============================================================================
// ZONO Property Radar™ — lightweight normalized-listing validation.
// Plain TypeScript checks (no zod/yup) so it stays client-safe and dependency
// free. Never throws — returns { valid, errors } so callers can decide what to do
// with a partial / malformed listing.
// ============================================================================
import type { NormalizedListingMetadata } from "./types";

export interface ListingValidationResult {
  valid: boolean;
  errors: string[];
}

const KNOWN_PROVIDERS = ["mock", "yad2", "madlan"];
const KNOWN_LISTING_TYPES = ["private", "broker", "project", "unknown"];

function isFiniteNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateNormalizedListingMetadata(
  listing: Partial<NormalizedListingMetadata> | null | undefined,
): ListingValidationResult {
  const errors: string[] = [];

  if (!listing || typeof listing !== "object") {
    return { valid: false, errors: ["listing is missing or not an object"] };
  }

  // provider
  if (!listing.provider) errors.push("provider is required");
  else if (!KNOWN_PROVIDERS.includes(listing.provider)) {
    errors.push(`provider "${listing.provider}" is not a known provider`);
  }

  // externalId
  if (!listing.externalId || typeof listing.externalId !== "string" || !listing.externalId.trim()) {
    errors.push("externalId is required");
  }

  // listingType
  if (!listing.listingType) errors.push("listingType is required");
  else if (!KNOWN_LISTING_TYPES.includes(listing.listingType)) {
    errors.push(`listingType "${listing.listingType}" is not a known type`);
  }

  // price (only when provided)
  if (listing.price !== undefined && listing.price !== null && !isFiniteNumber(listing.price)) {
    errors.push("price must be a finite number when provided");
  }

  // rooms (only when provided)
  if (listing.rooms !== undefined && listing.rooms !== null && !isFiniteNumber(listing.rooms)) {
    errors.push("rooms must be a finite number when provided");
  }

  // sizeSqm (only when provided)
  if (listing.sizeSqm !== undefined && listing.sizeSqm !== null && !isFiniteNumber(listing.sizeSqm)) {
    errors.push("sizeSqm must be a finite number when provided");
  }

  // city — preferred but not fatal; warn via error list only if entirely absent
  if (!listing.city || (typeof listing.city === "string" && !listing.city.trim())) {
    errors.push("city is missing");
  }

  return { valid: errors.length === 0, errors };
}
