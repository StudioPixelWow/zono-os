// ============================================================================
// ZONO — PHASE 26.13: Agency Intelligence API Layer™ — CLIENT-SAFE DTOs.
// One unified, typed contract for ALL agency-intelligence data (UI, Copilot,
// War Room, exports, automations). No server-only deps, no IO. Real data only:
// absent values are null + disclosed in source_summary.missingData — never a
// fabricated 0 (a real 0 stays 0).
// ============================================================================

/** Where a DTO's data came from + how trustworthy + what's missing. */
export interface ApiSourceSummary {
  categories: string[];          // data categories used (e.g. "agency_scores", "agency_signals")
  lastCalculated: string | null; // most recent calculated_at across the sources (null when unknown)
  confidence: number | null;     // 0..100 data confidence (null when not computable)
  missingData: string[];         // honest disclosure of what's absent
}

export interface AgencyIntelligenceOverviewDTO {
  agencies: number;
  agentsLinked: number;
  scoredAgencies: number;
  territories: number;
  activeSignals: number;
  highThreatCompetitors: number;
  opportunities: number;
  reportsGenerated: number;
  pendingResolutions: number;
  sourceSummary: ApiSourceSummary;
}

export interface AgencyIntelligenceCardDTO {
  agencyId: string;
  name: string;
  displayName: string | null;
  city: string | null;
  overall: number | null;
  threat: number | null;
  momentum: number | null;
  growth: number | null;
  dataConfidence: number | null; // 0..100
  topSignalTitle: string | null;
  summarySnippet: string | null;
  sourceSummary: ApiSourceSummary;
}

export type ThreatBand = "critical" | "high" | "moderate" | "low" | null;

export interface AgencyCompetitiveProfileDTO {
  agencyId: string;
  name: string;
  scores: {
    overall: number | null; threat: number | null; momentum: number | null; growth: number | null;
    marketStrength: number | null; coverage: number | null; inventory: number | null;
    luxury: number | null; digital: number | null; reputation: number | null; projects: number | null;
  };
  dataConfidence: number | null;
  period: { start: string | null; end: string | null };
  sourceSummary: ApiSourceSummary;
}

export interface AgencyTerritoryRowDTO {
  territoryType: string;
  label: string;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  dominance: number | null;
  inventoryShare: number | null; // 0..1
  momentum: number | null;
  trend: string | null;
  confidence: number | null;     // 0..1
}
export interface AgencyTerritoryProfileDTO {
  agencyId: string;
  territories: AgencyTerritoryRowDTO[];
  sourceSummary: ApiSourceSummary;
}

export interface AgencyThreatProfileDTO {
  agencyId: string;
  threat: number | null;
  threatBand: ThreatBand;
  momentum: number | null;
  drivers: { label: string; value: number | null }[];
  topSignals: AgencySignalDTO[];
  sourceSummary: ApiSourceSummary;
}

export interface AgencySignalDTO {
  id: string;
  signalType: string;
  severity: string | null;
  title: string;
  description: string | null;
  territoryLabel: string | null;
  importance: number | null;
  confidence: number | null;     // 0..1
  detectedAt: string;
}
export interface AgencySignalsProfileDTO {
  agencyId: string;
  signals: AgencySignalDTO[];
  sourceSummary: ApiSourceSummary;
}

export interface AgencyRecommendationDTO {
  title: string;
  reason: string;
  priority: "low" | "medium" | "high";
  relatedTerritory: string | null;
  confidence: number;            // 0..1
}
export interface AgencyReportDTO {
  reportType: string;
  periodStart: string | null;
  periodEnd: string | null;
  executiveSummary: string | null;
  strengths: { label: string; detail: string }[];
  weaknesses: { label: string; detail: string }[];
  opportunities: { label: string; detail: string }[];
  threats: { label: string; detail: string }[];
  recommendations: AgencyRecommendationDTO[];
  dataConfidence: number | null;
}
export interface AgencyReportsProfileDTO {
  agencyId: string;
  latest: AgencyReportDTO | null;
  history: { reportType: string; periodEnd: string | null; dataConfidence: number | null }[];
  sourceSummary: ApiSourceSummary;
}

export interface AgencyGraphNodeDTO { id: string; nodeType: string; label: string; importance: number | null }
export interface AgencyGraphEdgeDTO { source: string; target: string; edgeType: string; strength: number | null }
export interface AgencyGraphDTO {
  agencyId: string;
  nodes: AgencyGraphNodeDTO[];
  edges: AgencyGraphEdgeDTO[];
  stats: { totalNodes: number; totalEdges: number };
  sourceSummary: ApiSourceSummary;
}

export interface AgencyResolutionItemDTO {
  candidateId: string;
  detectedName: string;
  status: string;
  confidence: number | null;
  createdAt: string;
}
export interface AgencyResolutionDTO {
  agencyId: string;
  candidates: AgencyResolutionItemDTO[];
  feedback: { action: string; reviewedAt: string; reason: string | null }[];
  sourceSummary: ApiSourceSummary;
}

export interface TerritoryIntelligenceDTO {
  territory: { city: string | null; neighborhood: string | null; street: string | null };
  agencies: (AgencyTerritoryRowDTO & { agencyId: string; agencyName: string })[];
  leaderAgencyId: string | null;
  competitionLevel: "none" | "low" | "moderate" | "high" | null;
  sourceSummary: ApiSourceSummary;
}

export interface AgencyComparisonDTO {
  a: AgencyCompetitiveProfileDTO;
  b: AgencyCompetitiveProfileDTO;
  winnerByOverall: string | null;
  deltas: { metric: string; a: number | null; b: number | null; delta: number | null }[];
  sourceSummary: ApiSourceSummary;
}

/** The full per-agency composite (all profiles in one object). */
export interface AgencyIntelligenceAgencyDTO {
  agencyId: string;
  card: AgencyIntelligenceCardDTO;
  competitive: AgencyCompetitiveProfileDTO;
  territory: AgencyTerritoryProfileDTO;
  threat: AgencyThreatProfileDTO;
  signals: AgencySignalsProfileDTO;
  reports: AgencyReportsProfileDTO;
  graph: AgencyGraphDTO;
  resolution: AgencyResolutionDTO;
  sourceSummary: ApiSourceSummary;
}

// ── Filters ──────────────────────────────────────────────────────────────────
export type AgencySortBy = "threat" | "overall" | "momentum" | "confidence" | "growth";
export interface AgencyIntelligenceFilters {
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  agencyId?: string | null;
  threatMin?: number | null;
  scoreMin?: number | null;
  confidenceMin?: number | null;
  signalType?: string | null;
  severity?: string | null;
  period?: number | null;        // period days
  onlyActive?: boolean;
  hasReports?: boolean;
  hasSignals?: boolean;
  sortBy?: AgencySortBy;
  limit?: number;
  offset?: number;
}

export interface AgencyOpportunityDTO {
  label: string;
  city: string | null;
  neighborhood: string | null;
  agencyCount: number | null;
  reason: string;
}
export interface AgencyOpportunityFeedDTO {
  opportunities: AgencyOpportunityDTO[];
  sourceSummary: ApiSourceSummary;
}
