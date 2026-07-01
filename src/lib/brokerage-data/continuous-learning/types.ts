// ============================================================================
// 🔄 Continuous Brokerage Intelligence™ — types (client-safe, pure). 26.4.16.
// ----------------------------------------------------------------------------
// Turns every known city into a living entity that improves itself when new
// data appears — WITHOUT re-researching everything. This layer only ORCHESTRATES
// the engines already built (Research Jobs, Research Agent, City Discovery,
// Knowledge Base, Census, Verification). No new discovery/agent/prompt.
// ============================================================================
export const CONTINUOUS_LEARNING_VERSION = "26.4.16";

// Freshness / decay thresholds (constants — never magic in the UI).
export const REFRESH_STALE_DAYS = 30;
export const RESEARCH_STALE_DAYS = 60;
export const DECAY_START_MONTHS = 3;      // office confidence only decays after this
export const CONF_STEP_UP = 4;            // gentle per-refresh confidence nudge
export const CONF_STEP_DOWN = 3;          // slower decay
export const CONF_FLOOR = 20;             // never decay below this
export const CONF_CEIL = 95;

export type RefreshReason =
  | "waiting_candidates" | "low_coverage" | "stale_evidence"
  | "new_listings" | "new_brokers" | "event" | "manual";

// Scheduler priority tiers (Part 7) — lower number = higher priority.
export type PriorityTier = 1 | 2 | 3 | 4 | 5;
export const PRIORITY_LABEL: Record<PriorityTier, string> = {
  1: "מועמדים ממתינים", 2: "כיסוי נמוך", 3: "ראיות ישנות", 4: "מודעות חדשות", 5: "מתווכים חדשים",
};
export const REASON_HE: Record<RefreshReason, string> = {
  waiting_candidates: "מועמדים ממתינים לאימות", low_coverage: "כיסוי מאומת נמוך",
  stale_evidence: "ראיות התיישנו", new_listings: "מודעות לא מקושרות", new_brokers: "מתווכים לא משויכים",
  event: "אירוע נתונים", manual: "הפעלה ידנית",
};

export interface CityPriority {
  city: string; cityNormalized: string;
  tier: PriorityTier; tierLabel: string;
  reason: RefreshReason;
  score: number;                 // magnitude within the tier (for ordering)
  signals: {
    waitingCandidates: number; unmatchedBrokers: number; unlinkedListings: number;
    coveragePct: number; freshnessScore: number; rawDataExists: boolean;
  };
}

export interface SchedulerPlan {
  scannedCities: number;
  queue: CityPriority[];         // ranked, highest priority first
  picked: CityPriority | null;
  generatedAt: string;
}

export interface CityLearningProfile {
  city: string; cityNormalized: string;
  knownOffices: number; verifiedOffices: number; researchingOffices: number;
  knownBrokers: number; knownListings: number;
  waitingCandidates: number; pendingVerification: number;
  lastResearchAt: string | null; lastRefreshAt: string | null; lastEvidenceChangeAt: string | null;
  learningHealth: number;        // 0..100 composite
  coveragePct: number; freshnessScore: number; verificationPct: number;
  dataPresenceScore: number;
  missingKnowledge: string[];
  estimatedRemainingWork: number;   // items still to process (candidates + unmatched + unlinked)
  nextRefreshHint: string;
  activeJob: { id: string; status: string; stage: string; progress: number } | null;
}

export interface ContinuousTickResult {
  ran: boolean;
  picked: CityPriority | null;
  plan: SchedulerPlan;
  profileBefore: CityLearningProfile | null;
  profileAfter: CityLearningProfile | null;
  jobId: string | null;
  jobStatus: string | null;
  confidenceEvolved: number;     // offices whose confidence was nudged
  note: string;
}
