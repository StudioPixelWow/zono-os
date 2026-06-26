// ============================================================================
// ZONO — Agency Auto-Builder (Phase 26.2, PURE core).
// buildAgencyIdentityFromRawText: messy text → clean, professional identity
// (canonical/display name, brand, branch/city, aliases, confidence, status).
// Quality guards reject non-agency text. Persistence (create/enrich) lives in
// the server service so this stays pure + unit-testable.
// ============================================================================
import { normalizeAgencyName, agencySlug } from "../normalize";
import { detectAgencyBrand, isListingPlatform } from "./agencyBrandDetector";
import { cleanAgencyName, extractAgencyBranchAndCity, assessNameQuality } from "./agencyNameCleaner";
import { generateAgencyAliases } from "./agencyAliasGenerator";
import type { AgencyIdentity, AutoBuildInput, IdentityStatus } from "./agencyIdentityTypes";

/** Minimum overall confidence to auto-create (else needs_review). */
export const AUTOBUILD_CREATE_THRESHOLD = 0.72;

function reject(rawText: string, reason: string): AgencyIdentity {
  return {
    rawText, cleanedName: "", displayName: "", canonicalName: "", normalizedName: "", slug: "agency",
    brand: { brandName: null, franchiseName: null, normalizedBrand: null, matchedToken: null, isFranchise: false, confidence: 0 },
    location: { branch: null, city: null, cityMatchedLocality: false },
    aliases: [], confidence: 0, status: "ignored", rejected: true, rejectionReason: reason, evidence: { reason },
  };
}

/**
 * Build a clean agency identity from raw text. Returns `rejected: true` when the
 * text shouldn't become an agency (generic-only, contact-only, platform-only…).
 */
export function buildAgencyIdentityFromRawText(input: AutoBuildInput): AgencyIdentity {
  const rawText = (input.rawText ?? "").trim();
  if (!rawText) return reject(rawText, "empty");

  const brand = detectAgencyBrand(rawText);
  const cleaned = cleanAgencyName(rawText);

  // Guard: platform names (Yad2/Madlan/WinWin) are not agencies unless clearly
  // combined with a real agency name (i.e. there's more than just the platform).
  if (isListingPlatform(rawText) && (!brand.brandName || brand.confidence < 0.9)) {
    const residual = normalizeAgencyName(cleaned).split(" ").filter(Boolean);
    if (residual.length < 2) return reject(rawText, "listing_platform");
  }

  const quality = assessNameQuality(rawText, cleaned, Boolean(brand.brandName));
  if (!quality.ok) return reject(rawText, quality.reason ?? "low_quality");

  const location = extractAgencyBranchAndCity(rawText, input.knownLocalities ?? []);

  // Canonical name rules.
  const brandName = brand.brandName;
  let displayName: string;
  let canonicalName: string;
  if (brandName && location.branch) {
    displayName = `${brandName} ${location.branch}`;
    canonicalName = location.city ? `${brandName} ${location.branch} ${location.city}` : displayName;
  } else if (brandName && location.city) {
    displayName = `${brandName} ${location.city}`;
    canonicalName = displayName;
  } else if (brandName) {
    displayName = brandName;
    canonicalName = brandName;
  } else {
    displayName = cleaned;
    canonicalName = location.city ? `${cleaned} ${location.city}` : cleaned;
  }

  const normalizedName = normalizeAgencyName(canonicalName);
  const slug = agencySlug(canonicalName);

  // Confidence: brand drives most of it; contact signals + locality match add.
  let confidence = brandName ? brand.confidence : 0.55;
  if (location.cityMatchedLocality) confidence += 0.06;
  if (input.phone || input.email || input.website) confidence += 0.08;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  const aliases = generateAgencyAliases({ brand, location, cleanedName: cleaned, displayName });

  const status: IdentityStatus = confidence >= AUTOBUILD_CREATE_THRESHOLD ? "auto_created" : "needs_review";

  return {
    rawText, cleanedName: cleaned, displayName, canonicalName, normalizedName, slug,
    brand, location, aliases, confidence, status, rejected: false, rejectionReason: null,
    evidence: {
      brand: brandName, franchise: brand.franchiseName, matchedToken: brand.matchedToken,
      branch: location.branch, city: location.city, cityMatchedLocality: location.cityMatchedLocality,
      source: input.source ?? null, sourceRef: input.sourceRef ?? null,
    },
  };
}
