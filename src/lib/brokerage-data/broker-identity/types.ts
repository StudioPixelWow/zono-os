// ============================================================================
// 🧬 Broker Identity Resolution — shared types (Phase 26.12). Pure, client-safe.
// ============================================================================

export type EvidenceSource =
  | "google_business" | "google_maps" | "facebook" | "linkedin" | "yad2" | "madlan"
  | "official_website" | "observed_listing" | "shared_phone" | "shared_domain" | "ai_reasoning";

export type BrokerResolutionStatus =
  | "resolved" | "needs_review" | "insufficient_evidence" | "conflicting_evidence";

/** One structured evidence item. officeName is the OBSERVED/recommended office —
 *  never invented. weight comes from the deterministic source-weight table. */
export interface IdentityEvidence {
  source: EvidenceSource;
  officeName: string | null;
  url: string | null;
  confidence: number;     // 0–100 — the source's own confidence
  weight: number;         // 0–100 — deterministic source trust weight
  reason: string;
  observedText: string | null;
}

/** A public provider's structured result (or a skip with a reason). */
export interface ProviderResult {
  provider: EvidenceSource;
  enabled: boolean;
  skippedReason: string | null;   // e.g. "not_configured"
  evidence: IdentityEvidence[];
}

export interface IdentityListing {
  id: string; contactName: string | null; detectedBrokerName: string | null;
  contactType: string | null; city: string | null; neighborhood: string | null;
  source: string | null; domain: string | null;
}

/** The full observed evidence package for one broker (STEP 1). */
export interface BrokerIdentityPackage {
  agentId: string;
  fullName: string;
  normalizedName: string;
  phones: string[];
  emails: string[];
  city: string | null;
  neighborhoods: string[];
  domains: string[];
  listings: IdentityListing[];
  sharedPhoneBrokerNames: string[];
  sharedDomainBrokerNames: string[];
  /** detected_broker_name values that EQUAL the broker's own name (STEP 7 — ignored as office evidence). */
  selfNameHits: string[];
}

export interface OfficeCandidateScore {
  officeName: string;
  normalizedName: string;
  officeId: string | null;     // set when it matches an EXISTING brokerage_offices row
  score: number;               // combined deterministic score
  topSource: EvidenceSource;
  sources: EvidenceSource[];
  evidence: IdentityEvidence[];
}

export interface BrokerResolution {
  agentId: string;
  fullName: string;
  status: BrokerResolutionStatus;
  resolvedOfficeId: string | null;
  resolvedOfficeName: string | null;
  confidence: number;
  why: string;
  aiReasoning: string | null;
  evidence: IdentityEvidence[];
  providers: { provider: EvidenceSource; enabled: boolean; skippedReason: string | null }[];
  alternatives: { officeName: string; score: number; rejectedReason: string }[];
  missingEvidence: string[];
}
