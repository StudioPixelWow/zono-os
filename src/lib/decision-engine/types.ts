// ============================================================================
// 🧭 ZONO Decision Engine™ & Action Planner — types (client-safe, pure). 27.4.
// ----------------------------------------------------------------------------
// The central engine that turns EXISTING intelligence (competitive / territory /
// broker / office / inventory) into prioritized, evidence-based, actionable
// business decisions. This is NOT a chatbot and NOT another AI assistant —
// every recommendation cites the evidence it came from and is never speculative.
// No valuation / MAI / discovery / intelligence-engine changes.
// ============================================================================
export const DECISION_ENGINE_VERSION = "27.4";

export type DecisionCategory =
  | "SALES" | "MARKETING" | "BROKERAGE" | "PROPERTY" | "SELLER" | "BUYER"
  | "OFFICE" | "BROKER" | "MARKET" | "TERRITORY" | "COMPETITIVE" | "OPERATIONS";

export type ExecutionReadiness = "can_execute" | "needs_approval" | "blocked" | "waiting_for_data";
export const EXECUTION_HE: Record<ExecutionReadiness, string> = {
  can_execute: "ניתן לביצוע אוטומטי", needs_approval: "דורש אישור", blocked: "חסום", waiting_for_data: "ממתין לנתונים",
};
export type Impact = "high" | "medium" | "low";
export type Severity = "low" | "moderate" | "high";

export interface Action {
  id: string; title: string;
  priority: number;                 // 0..100
  expectedImpact: Impact; effort: Impact;
  deadlineDays: number | null; confidence: number; reason: string;
}

export interface Decision {
  id: string; category: DecisionCategory; title: string;
  priorityScore: number;            // 0..100
  executionReadiness: ExecutionReadiness;
  evidence: string[];               // WHY — every point is real
  why: string;                      // one-line synthesis
  actions: Action[];
}

export interface Risk { id: string; type: string; severity: Severity; title: string; evidence: string }
export interface Opportunity { id: string; type: string; title: string; evidence: string; area: string | null }

export interface DecisionPackage {
  subjectType: "office" | "city"; subjectId: string; subjectName: string;
  businessScore: number;            // 0..100
  aiConfidence: number;             // 0..100 (data completeness — never overstated)
  decisions: Decision[];
  risks: Risk[];
  opportunities: Opportunity[];
  notes: string[];
  version: string;
}

export interface DailyBriefing {
  city: string; cityNormalized: string;
  businessScore: number; aiConfidence: number;
  todaysPriorities: Decision[];
  topRisks: Risk[]; topOpportunities: Opportunity[];
  competitorAlerts: string[]; brokerAlerts: string[]; propertyAlerts: string[];
  valuationAlerts: string[]; marketAlerts: string[];
  notes: string[];
  version: string;
}

// ── Normalized signals the planner reads (decoupled from the source engines) ──
export interface OfficeDecisionSignals {
  officeId: string; officeName: string; brand: string | null;
  marketRank: number; totalOffices: number;
  listingSharePct: number; brokerSharePct: number; luxurySharePct: number; commercialSharePct: number;
  activeListings: number; brokers: number; neighborhoods: number;
  growthPct: number; momentum: "growing" | "stable" | "declining"; threatLevel: "low" | "moderate" | "high";
  fastestGrowingCompetitor: { name: string; growthPct: number } | null;
  weakAreas: { name: string; sharePct: number }[];
  expansionOpportunities: { name: string; reason: string }[];
  swotWeaknesses: { text: string; evidence: string }[];
  swotThreats: { text: string; evidence: string }[];
  swotOpportunities: { text: string; evidence: string }[];
  inventoryConflicts: number; stagnantListings: number;
  hasData: boolean;
}
