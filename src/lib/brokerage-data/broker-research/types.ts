// ============================================================================
// 🔬 National Brokerage Research — shared types (Phase 26.13b). Pure, client-safe.
// Research discovers structured evidence; it never fabricates a conclusion.
// ============================================================================

/** One structured evidence item from a research provider. Every field is
 *  observed/extracted — never invented. */
export interface ResearchEvidence {
  provider: string;
  query: string | null;
  url: string | null;
  title: string | null;
  snippet: string | null;
  extractedOfficeName: string | null;
  extractedBrokerName: string | null;
  extractedPhone: string | null;
  extractedWebsite: string | null;
  confidence: number;          // 0–100 the provider's own confidence
  evidenceText: string | null;
  fetchedAt: string;           // ISO
}

export interface ProviderStatus {
  provider: string;
  label: string;
  configured: boolean;
  skippedReason: string | null;   // e.g. "not_configured"
  resultCount: number;
}

export interface PossibleOffice {
  officeName: string;
  brandNetwork: string | null;
  confidence: number;
  sources: string[];
}

export interface BrokerResearchDossier {
  agentId: string;
  brokerName: string;
  normalizedName: string;
  city: string | null;
  phones: string[];
  neighborhoods: string[];
  listingUrls: string[];
  sourceDomains: string[];
  queries: string[];
  evidence: ResearchEvidence[];
  providers: ProviderStatus[];
  possibleOffices: PossibleOffice[];
  priorStatus: string | null;
  aiSummary: string | null;
  missingEvidence: string[];
  status: "resolved" | "needs_review" | "insufficient_evidence" | "conflicting_evidence";
}

export interface ResearchRunDiagnostics {
  brokersProcessed: number;
  providersConfigured: number;
  providersSkipped: number;
  queriesGenerated: number;
  publicResultsFound: number;
  evidenceItemsCreated: number;
  aiCalls: number;
  aiResolved: number;
  candidatesCreated: number;
  autoLinked: number;
  needsReview: number;
  insufficientEvidence: number;
  errors: string[];
}
