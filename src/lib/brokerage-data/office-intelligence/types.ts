// ============================================================================
// 🏢 Office Intelligence Builder™ — types (client-safe, pure). 26.4.18.
// ----------------------------------------------------------------------------
// Builds a rich, EVIDENCE-BACKED office profile for a single candidate, then
// re-runs the EXISTING verification rule to decide promotion. AI may summarize/
// extract; only public evidence verifies. No fake phone/website/logo, no new
// discovery engine, no new AI seeding prompt, no verification-rule change.
// ============================================================================
export const OFFICE_INTELLIGENCE_VERSION = "26.4.18";

export interface EvidenceRef { value: string; sourceUrl: string | null; sourceTitle: string | null }

export interface OfficeProfileDraft {
  name: string; normalizedName: string;
  brand: string | null; branch: string | null;
  city: string; cityConfirmed: boolean; address: string | null;
  phones: EvidenceRef[];
  emails: EvidenceRef[];
  website: string | null;
  domains: string[];
  socialLinks: string[];
  directoryLinks: string[];
  portalLinks: string[];
  listingLinks: string[];
  brokerNames: string[];
  logoUrl: string | null;              // real logo only, else null (never fabricated)
  brokerageKeywordFound: boolean;
  evidenceSummary: string;
  missingFields: string[];
  contradictions: string[];
  completeness: number;                // 0..100
}

/** Verification signals derived from the SAME hits (existing rule unchanged). */
export interface ProfileSignals {
  strongSources: number; independentDomains: number; proven: boolean;
  phone: string | null; publicUrls: string[]; evidenceFound: string[];
}

export interface EnrichmentResult {
  candidateId: string; officeName: string; city: string;
  searchConfigured: boolean; aiConfigured: boolean;
  searchesRun: number;
  profile: OfficeProfileDraft | null;
  signals: ProfileSignals | null;
  proven: boolean;
  promotedOfficeId: string | null;
  status: "verified" | "researching" | "skipped";
  missing: string[];
  note: string;
}

export interface CityEnrichmentResult {
  city: string; cityNormalized: string;
  searchConfigured: boolean;
  totalCandidates: number; processed: number; remaining: number;
  verified: number; researching: number; skipped: number;
  timedOut: boolean; elapsedMs: number;
  results: EnrichmentResult[];
  notes: string[];
  version: string;
}
