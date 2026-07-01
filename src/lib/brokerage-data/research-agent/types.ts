// ============================================================================
// 🧠 Brokerage Research Agent™ v1 — types (client-safe, pure). Phase 26.4.13.
// ----------------------------------------------------------------------------
// A multi-step, human-like research loop that learns a city's brokerage
// ecosystem. AI plans/extracts/dedupes/summarizes — it is NEVER a source of
// truth. Only PUBLIC evidence verifies an office. Candidates are saved as
// "researching" immediately (resumable, never frozen); verification only
// upgrades status; nothing is auto-deleted.
// ============================================================================
export const RESEARCH_AGENT_VERSION = "26.4.13";

export type ResearchDepth = "quick" | "standard" | "deep";

export type ResearchStage =
  | "city_understanding" | "franchises" | "independents"
  | "directories" | "portals" | "social" | "cross_reference";

export const ALL_STAGES: ResearchStage[] = [
  "city_understanding", "franchises", "independents", "directories", "portals", "social", "cross_reference",
];

export interface AgentOptions {
  depth?: ResearchDepth;
  maxSearches?: number;
  maxCandidates?: number;
  verifyCandidates?: boolean;
  saveCandidates?: boolean;
  includeFranchises?: boolean;
  includeIndependents?: boolean;
  includePortals?: boolean;
  includeSocial?: boolean;
  includeDirectories?: boolean;
  budgetMs?: number;
}

export interface DepthConfig { maxSearches: number; maxCrossRef: number; verifyCap: number; budgetMs: number }
export const DEPTH_CONFIG: Record<ResearchDepth, DepthConfig> = {
  quick: { maxSearches: 8, maxCrossRef: 6, verifyCap: 8, budgetMs: 15000 },
  standard: { maxSearches: 16, maxCrossRef: 16, verifyCap: 18, budgetMs: 25000 },
  deep: { maxSearches: 30, maxCrossRef: 40, verifyCap: 40, budgetMs: 40000 },
};

export interface SearchRecord { stage: ResearchStage; query: string; hits: number; ms: number; error: string | null }

export interface DiscoveredName {
  raw: string; stage: ResearchStage; url: string | null; snippet: string | null;
  brand: string | null; branch: string | null; aiConfidence: number;
}

export type CandidateStatus = "researching" | "verified" | "rejected";

export interface AgentCandidate {
  name: string; officeName: string; normalizedName: string; normalizedBrand: string;
  brandNetwork: string | null; branch: string | null; aliases: string[];
  stage: ResearchStage;
  status: CandidateStatus;
  saved: boolean; researched: boolean; candidateId: string | null;
  aiExtractionConfidence: number;   // AI's extraction confidence — no authority
  systemConfidence: number;         // derived ONLY from public evidence
  sourcesChecked: string[];
  evidenceFound: string[];
  publicUrls: string[];
  phone: string | null;
  verdictReason: string;
}

export interface AgentReport {
  city: string; cityNormalized: string; depth: ResearchDepth;
  aiConfigured: boolean; searchConfigured: boolean;
  stagesRun: ResearchStage[];
  searches: SearchRecord[];
  searchesCompleted: number;
  sourcesChecked: number;
  knownBefore: number;              // reused persistent-KB offices/candidates
  candidatesFound: number;
  candidatesSaved: number;
  candidatesVerified: number;
  candidatesResearching: number;
  candidatesWaitingForEvidence: number;
  candidatesRejected: number;
  candidates: AgentCandidate[];
  gaps: string[];
  steps: string[];                  // live progress log (never looks stuck)
  timedOut: boolean;
  elapsedMs: number;
  notes: string[];
  version: string;
}
