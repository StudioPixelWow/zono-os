// ============================================================================
// ZONO — Agency Auto-Builder identity types (Phase 26.2, client-safe).
// ============================================================================

export type IdentityStatus = "verified" | "auto_created" | "needs_review" | "merged" | "ignored";

export interface BrandDetection {
  brandName: string | null;        // canonical brand (e.g. "RE/MAX")
  franchiseName: string | null;    // franchise label when applicable
  normalizedBrand: string | null;  // normalized for matching
  matchedToken: string | null;     // the token that matched
  isFranchise: boolean;
  confidence: number;              // 0..1
}

export interface BranchCity {
  branch: string | null;           // e.g. "חלוצים" / "Halutzim"
  city: string | null;             // e.g. "קריות" / "Kiryat Bialik"
  cityMatchedLocality: boolean;    // matched against israel_localities
}

/** The clean identity the auto-builder produces from raw text. */
export interface AgencyIdentity {
  rawText: string;
  cleanedName: string;             // noise removed, brand preserved
  displayName: string;             // human-facing (brand + branch/city)
  canonicalName: string;           // legal/canonical (brand + branch + city)
  normalizedName: string;          // comparison-grade
  slug: string;
  brand: BrandDetection;
  location: BranchCity;
  aliases: string[];
  confidence: number;              // 0..1 overall
  status: IdentityStatus;          // suggested status
  rejected: boolean;               // true → not a real agency (guard tripped)
  rejectionReason: string | null;
  evidence: Record<string, unknown>;
}

export interface AutoBuildInput {
  rawText: string;
  source?: string | null;
  sourceRef?: string | null;
  /** Optional org locality names to match city/branch against. */
  knownLocalities?: string[];
  /** Phone/email/website if available — strengthen identity + dedupe. */
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}
