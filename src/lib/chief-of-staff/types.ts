// ============================================================================
// 🧠 ZONO AI Chief of Staff™ — types (client-safe, pure). Phase 27.6.
// ----------------------------------------------------------------------------
// The central orchestration layer over EVERY existing ZONO engine (Discovery /
// Knowledge Graph / Decision Engine / Mission Engine / Valuation / MAI /
// Territory / Competitive / Broker / Office Intelligence). It NEVER becomes a
// source of truth — it observes, prioritizes, connects, recommends and
// coordinates. Every recommendation cites the evidence it came from. Nothing is
// fabricated and nothing auto-executes. No changes to any orchestrated engine.
// ============================================================================
export const CHIEF_OF_STAFF_VERSION = "27.6";

export type Impact = "high" | "medium" | "low";

// ── Normalized signals the pure scorer/reasoner read (decoupled from engines) ─
export interface OrgMissionSignals {
  active: number; completed: number; cancelled: number;
  blocked: number; waiting: number; inProgress: number;
  executionScore: number;          // 0..100 (from Action Center)
  completionRatePct: number;       // 0..100
}
export interface OrgMarketSignals {
  citiesAnalyzed: number;
  avgBusinessScore: number;        // 0..100 mean over analyzed cities
  avgConfidence: number;           // 0..100 mean data-completeness
  decliningCities: number;         // cities with negative inventory trend
  riskCount: number;               // aggregated top risks
  opportunityCount: number;        // aggregated top opportunities
  competitiveAlerts: number;       // growing competitors observed
}
export interface OrgSignals {
  offices: number; brokers: number; activeListings: number;
  activeCities: number; brands: number;
  agentsWithOffice: number;
  linkCoveragePct: number;         // % listing links with an agent
  resolutionRatePct: number;       // % brokers resolved to an office
  dataQualityScore: number;        // 0..100 composite graph completeness
  missions: OrgMissionSignals;
  market: OrgMarketSignals;
  sourcesUsed: number;             // how many engines contributed evidence
}

// ── Organization Score (Part 9) ──────────────────────────────────────────────
export interface ScoreDim { key: string; label: string; score: number; basis: string }
export interface OrganizationScore {
  growth: number; execution: number; coverage: number; competitivePosition: number;
  dataQuality: number; operationalHealth: number; missionSuccess: number; learningProgress: number;
  overall: number;                 // 0..100 weighted
  dims: ScoreDim[];
  confidence: number;              // 0..100 — how much data backs the score
}

// ── Executive Dashboard (Part 8) ─────────────────────────────────────────────
export interface HealthScore { key: string; label: string; score: number; basis: string }
export interface ExecutiveDashboard {
  health: HealthScore[];           // business / execution / market / sales / growth / risk
  aiConfidence: number;            // 0..100
  overallScore: number;            // 0..100
}

// ── Explainable recommendation (Part 4 + Part 7) ─────────────────────────────
export type RecKind = "priority" | "risk" | "opportunity" | "mission" | "intervention";
export interface ExecutiveRecommendation {
  id: string; kind: RecKind; title: string;
  why: string;                     // WHY (one-line synthesis)
  evidence: string[];              // real evidence points
  affectedEntities: string[];      // entities touched (office/city/broker/…)
  expectedOutcome: string;
  confidence: number;              // 0..100
  businessImpact: Impact;
  urgency: number;                 // 0..100
  alternatives: string[];          // alternative actions
  sourceModule: string;            // which engine produced the evidence
}

// ── Cross-module reasoning (Part 3) ──────────────────────────────────────────
export interface CrossModuleInsight {
  id: string; title: string;
  chain: string[];                 // the reasoning chain, step by step
  evidence: string[];
  recommendation: string;
  confidence: number; businessImpact: Impact;
  affectedEntities: string[];
  modules: string[];               // engines the chain connects
}

// ── Business / organizational memory (Part 5) ────────────────────────────────
export interface BusinessMemory {
  completedMissions: number; failedMissions: number;
  repeatedProblems: { key: string; count: number; note: string }[];
  successfulStrategies: { key: string; count: number; note: string }[];
  summary: string;
  notes: string[];
}

// ── Executive Briefing (Part 2) ──────────────────────────────────────────────
export interface ExecutiveBriefing {
  businessScore: number; executionScore: number; aiConfidence: number;
  todaysPriorities: ExecutiveRecommendation[];
  criticalRisks: ExecutiveRecommendation[];
  urgentMissions: ExecutiveRecommendation[];
  importantOpportunities: ExecutiveRecommendation[];
  competitiveAlerts: string[]; valuationAlerts: string[];
  brokerAlerts: string[]; officeAlerts: string[]; marketAlerts: string[];
  missionBlockers: string[];
  notes: string[];
}

// ── Global Context (Part 1) ──────────────────────────────────────────────────
export interface CityContext {
  city: string; cityNormalized: string;
  businessScore: number; aiConfidence: number;
  priorities: number; risks: number; opportunities: number;
  competitorAlerts: string[]; marketAlerts: string[]; brokerAlerts: string[];
}
export interface GlobalContext {
  orgId: string | null; generatedAt: string;
  organization: { offices: number; brokers: number; activeListings: number; activeCities: number; brands: number };
  dataQuality: { linkCoveragePct: number; resolutionRatePct: number; score: number; label: string };
  missions: OrgMissionSignals & { todaysTasks: number; upcoming: number };
  market: { cities: CityContext[]; avgBusinessScore: number; avgConfidence: number; decliningCities: number };
  decisions: { priorities: number; risks: number; opportunities: number };
  sources: string[];               // which engines/context-packages loaded
  notes: string[];
}

// ── The one unified Chief-of-Staff report ────────────────────────────────────
export interface ExecutiveRecommendations {
  topPriorities: ExecutiveRecommendation[];
  topRisks: ExecutiveRecommendation[];
  topOpportunities: ExecutiveRecommendation[];
  topMissions: ExecutiveRecommendation[];
  highestRoi: ExecutiveRecommendation[];
  highestUrgency: ExecutiveRecommendation[];
}
export interface ChiefOfStaffReport {
  version: string; orgId: string | null; generatedAt: string;
  globalContext: GlobalContext;
  organizationScore: OrganizationScore;
  dashboard: ExecutiveDashboard;
  briefing: ExecutiveBriefing;
  recommendations: ExecutiveRecommendations;
  crossModuleInsights: CrossModuleInsight[];
  interventions: ExecutiveRecommendation[];   // Execution Coordinator (Part 6)
  businessMemory: BusinessMemory;
  notes: string[];
}
