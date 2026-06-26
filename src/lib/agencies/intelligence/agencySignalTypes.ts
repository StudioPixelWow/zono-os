// ============================================================================
// ZONO — Agency Signals + Timeline Intelligence™ (Phase 26.6). Types + PURE
// helpers. CLIENT-SAFE: no server-only deps, no IO. DATA SAFETY: a signal is
// only ever produced from a real, measured change — never fabricated.
// ============================================================================

export type AgencyIntelSignalType =
  | "agency_entered_new_area" | "agency_left_area"
  | "agency_activity_spike" | "agency_activity_drop"
  | "agency_inventory_growth" | "agency_inventory_loss"
  | "agency_dominance_gained" | "agency_dominance_lost"
  | "agency_momentum_spike" | "agency_momentum_drop"
  | "agency_score_spike" | "agency_score_drop"
  | "high_competition_threat"
  | "project_connection_detected" | "developer_connection_detected"
  | "agent_network_expanded" | "agent_network_shrunk"
  | "territory_opportunity" | "user_weak_area" | "low_competition_area"
  | "weak_data_confidence";

export type AgencySignalSeverityLevel = "low" | "medium" | "high" | "critical";
export type AgencySignalStatus = "active" | "resolved" | "ignored" | "archived";
export type AgencyTerritoryLevel = "city" | "neighborhood" | "street";

/** A snapshot of one territory the agency operates in. */
export interface TerritorySnapshot {
  territoryType: AgencyTerritoryLevel;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  territoryKey: string;
  dominance: number | null;       // 0..100
  momentum: number | null;        // 0..100
  activeListings: number;
  opportunityTypes: string[];     // from Phase 26.4 metadata
}

/** Full current state of an agency used for change detection. */
export interface AgencySnapshot {
  agencyId: string;
  overall: number | null;
  growth: number | null;
  momentum: number | null;        // agency-level mean momentum
  competitionThreat: number | null;
  dataConfidence: number | null;  // 0..100
  agentCount: number;
  projectCount: number;
  developerCount: number;
  territories: TerritorySnapshot[];
}

/** A detected signal (pre-persistence). */
export interface DetectedAgencySignal {
  agencyId: string;
  signalType: AgencyIntelSignalType;
  severity: AgencySignalSeverityLevel;
  importance: number;             // 0..100
  confidence: number;             // 0..1
  title: string;
  description: string | null;
  territoryType: AgencyTerritoryLevel | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  entityType: string | null;
  entityId: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  dedupeKey: string;
  /** Stable key of the underlying metric so the next run can read score_after. */
  metricKey: string;
  metadata: Record<string, unknown>;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Signals that are inherently negative/threatening (raise base severity).
const RISK_TYPES = new Set<AgencyIntelSignalType>([
  "high_competition_threat", "agency_dominance_lost", "agency_inventory_loss",
  "agency_score_drop", "agency_momentum_drop", "agency_left_area",
  "agency_activity_drop", "agent_network_shrunk", "user_weak_area",
]);

/** Severity from the signal type + normalized change magnitude (0..1). */
export function severityFor(type: AgencyIntelSignalType, magnitude: number, opts: { userOverlap?: boolean } = {}): AgencySignalSeverityLevel {
  const m = clamp(magnitude, 0, 1);
  if (type === "high_competition_threat") return opts.userOverlap ? "critical" : "high";
  if (type === "weak_data_confidence") return "low";
  if (type === "agency_dominance_gained" || type === "agency_dominance_lost") return m >= 0.5 ? "high" : "medium";
  if (type === "agency_score_spike" || type === "agency_score_drop") return m >= 0.6 ? "high" : "medium";
  const base: AgencySignalSeverityLevel = m >= 0.66 ? "high" : m >= 0.33 ? "medium" : "low";
  if (RISK_TYPES.has(type) && base === "low") return "medium";
  return base;
}

/**
 * Importance score (0..100). Larger movements, higher-level territories, and
 * overlap with the user's specialization raise importance; street-level micro
 * changes and weak-confidence (non-risk) signals lower it.
 */
export function importanceFor(input: {
  type: AgencyIntelSignalType;
  magnitude: number;            // 0..1
  territoryType?: AgencyTerritoryLevel | null;
  userOverlap?: boolean;        // territory overlaps the user's specialization
  confidence?: number;          // 0..1
  isRisk?: boolean;
}): number {
  const m = clamp(input.magnitude, 0, 1);
  let score = 30 + m * 45; // base 30..75 from movement size

  const levelBoost = input.territoryType === "city" ? 15 : input.territoryType === "neighborhood" ? 8 : input.territoryType === "street" ? 2 : 10;
  score += levelBoost;
  if (input.userOverlap) score += 15;
  if (input.type === "high_competition_threat") score += 15;

  // Low data confidence dampens importance — unless it's a risk signal.
  const conf = input.confidence ?? 0.6;
  if (conf < 0.4 && !input.isRisk) score *= 0.7;

  return Math.round(clamp(score, 0, 100));
}

export const SIGNAL_LABEL: Record<AgencyIntelSignalType, string> = {
  agency_entered_new_area: "כניסה לאזור חדש",
  agency_left_area: "יציאה מאזור",
  agency_activity_spike: "זינוק בפעילות",
  agency_activity_drop: "ירידה בפעילות",
  agency_inventory_growth: "גידול במלאי",
  agency_inventory_loss: "ירידה במלאי",
  agency_dominance_gained: "עלייה בדומיננטיות",
  agency_dominance_lost: "ירידה בדומיננטיות",
  agency_momentum_spike: "זינוק בתאוצה",
  agency_momentum_drop: "ירידה בתאוצה",
  agency_score_spike: "עלייה בציון הכולל",
  agency_score_drop: "ירידה בציון הכולל",
  high_competition_threat: "איום תחרותי גבוה",
  project_connection_detected: "חיבור לפרויקט חדש",
  developer_connection_detected: "חיבור ליזם חדש",
  agent_network_expanded: "הרחבת רשת סוכנים",
  agent_network_shrunk: "צמצום רשת סוכנים",
  territory_opportunity: "הזדמנות באזור",
  user_weak_area: "אזור חולשה שלך",
  low_competition_area: "אזור עם תחרות נמוכה",
  weak_data_confidence: "רמת ביטחון נתונים נמוכה",
};

export function isRiskSignal(type: AgencyIntelSignalType): boolean { return RISK_TYPES.has(type); }
