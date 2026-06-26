// ============================================================================
// ZONO — AI SWOT + Executive Agency Summary™ (Phase 26.7). Types + PURE helpers.
// CLIENT-SAFE: no server-only deps, no IO. DATA SAFETY: generators only assert
// what the snapshot supports; missing data is disclosed, never invented.
// ============================================================================

export type AgencyReportType = "executive_summary" | "swot" | "competitive_position" | "full_report";

export interface SwotItem {
  key: string;
  label: string;
  detail: string;
  evidence?: string;          // what real data backs this
}

export interface AgencyRecommendation {
  title: string;
  reason: string;
  priority: "low" | "medium" | "high";
  relatedSignalId?: string | null;
  relatedTerritory?: string | null;
  confidence: number;         // 0..1
}

export interface SnapshotScores {
  overall: number | null; marketStrength: number | null; growth: number | null;
  digital: number | null; luxury: number | null; inventory: number | null;
  coverage: number | null; projects: number | null; reputation: number | null;
  momentum: number | null; competitionThreat: number | null; dataConfidence: number | null;
}

export interface SnapshotSignal {
  id: string | null;
  signalType: string;
  severity: string | null;
  importance: number | null;
  title: string;
  territoryLabel: string | null;
}

export interface SnapshotTerritory {
  cities: string[];
  neighborhoods: string[];
  streets: string[];
  topDominant: { label: string; dominance: number }[];
  avgDominance: number | null;
  avgMomentum: number | null;
  activeListings: number;
  soldCount: number;
  dealsCount: number;
  luxuryShare: number | null;
}

export interface SnapshotGraph {
  agentCount: number; branchCount: number; projectCount: number; developerCount: number; propertyCount: number;
}

/** The full, auditable source snapshot a report is generated from. */
export interface AgencyReportSnapshot {
  agencyId: string;
  agencyName: string;
  periodStart: string;
  periodEnd: string;
  scores: SnapshotScores;
  territory: SnapshotTerritory;
  graph: SnapshotGraph;
  signals: SnapshotSignal[];
  recentEvents: { eventType: string; title: string; importance: number | null }[];
  hasDigital: boolean;
  hasReputation: boolean;
  /** Areas where data is absent (disclosed in the summary). */
  missing: string[];
}

export interface AgencyReport {
  agencyId: string;
  reportType: AgencyReportType;
  periodStart: string;
  periodEnd: string;
  executiveSummary: string;
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  recommendations: AgencyRecommendation[];
  keySignals: SnapshotSignal[];
  keyScores: SnapshotScores;
  dataConfidence: number | null;
}

// Signal-type → SWOT bucket mappings (real signals only).
export const OPPORTUNITY_SIGNALS = new Set([
  "territory_opportunity", "low_competition_area", "competitor_momentum", "agency_entered_new_area",
]);
export const THREAT_SIGNALS = new Set([
  "high_competition_threat", "competitor_dominance", "agency_inventory_loss",
  "agency_dominance_lost", "agent_network_shrunk", "agency_momentum_drop",
]);

/** Confidence label for the executive summary. */
export function confidenceWord(dc: number | null): "גבוהה" | "בינונית" | "נמוכה" {
  if (dc == null) return "נמוכה";
  return dc >= 65 ? "גבוהה" : dc >= 35 ? "בינונית" : "נמוכה";
}
