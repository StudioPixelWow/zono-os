// ============================================================================
// 🔬 Office Promotion Explainability™ — types (client-safe, pure). 26.4.17.
// ----------------------------------------------------------------------------
// A READ-ONLY debugger over the EXISTING candidate promotion. It explains, for
// every candidate, exactly why it did or didn't become a real office — no black
// box. It changes NO discovery/AI/verification rules; it only reads the evidence
// those engines already produced.
// ============================================================================
export const PROMOTION_DEBUG_VERSION = "26.4.17";

export type PromotionStatus = "READY" | "BLOCKED" | "WAITING" | "REJECTED";

export type CheckState = "pass" | "fail" | "unknown";
export interface ChecklistItem { key: string; label: string; state: CheckState; note: string | null }

export interface FailedRule { code: string; title: string; reason: string; detail: string | null }

// Promotion Score (Part 4) — separate from system confidence.
export interface PromotionScoreItem { key: string; label: string; max: number; got: number }
export interface PromotionScore { total: number; items: PromotionScoreItem[] }

export interface PromotionSimulation { hypothesis: string; wouldVerify: boolean; explanation: string }

// Promotion pipeline (Part 7).
export type PipelineStage =
  | "AI" | "SAVED" | "VERIFIED" | "PROMOTED" | "OFFICE_CREATED" | "BROKER_MATCHING" | "LISTING_RELINK";
export const PIPELINE_STAGES: PipelineStage[] = [
  "AI", "SAVED", "VERIFIED", "PROMOTED", "OFFICE_CREATED", "BROKER_MATCHING", "LISTING_RELINK",
];
export const PIPELINE_STAGE_HE: Record<PipelineStage, string> = {
  AI: "AI (הוצע)", SAVED: "נשמר", VERIFIED: "אומת", PROMOTED: "קודם",
  OFFICE_CREATED: "משרד נוצר", BROKER_MATCHING: "שיוך מתווכים", LISTING_RELINK: "קישור מודעות",
};

export type OfficeCreationOutcome = "Created" | "Skipped" | "Merged" | "AlreadyExists" | "Blocked" | "Rejected";

export interface CandidatePromotionDebug {
  candidateId: string;
  officeName: string; normalizedName: string; brandNetwork: string | null;
  city: string; suggestedBy: string;
  status: PromotionStatus;
  promotionScore: PromotionScore;
  systemConfidence: number;          // the EXISTING system confidence (unchanged)
  checklist: ChecklistItem[];
  failedRules: FailedRule[];
  topReasons: string[];              // Part 5 — top blocking reasons (≤5)
  simulations: PromotionSimulation[];
  pipeline: { reached: PipelineStage; stoppedAt: PipelineStage | null; stages: { stage: PipelineStage; done: boolean }[] };
  officeCreation: { outcome: OfficeCreationOutcome; explanation: string };
  evidence: { strongSources: number; independentDomains: number; phone: string | null; publicUrls: string[]; evidenceFound: string[]; sourcesChecked: string[]; researched: boolean; systemVerified: boolean };
  // 26.4.18 — office-intelligence enrichment (null until enriched).
  profileCompleteness: number | null;
  lastEnrichedAt: string | null;
}

export interface PromotionDebugDashboard {
  city: string; cityNormalized: string;
  totals: { candidates: number; ready: number; blocked: number; waiting: number; rejected: number; verified: number };
  averagePromotionScore: number;
  mostCommonBlockingReason: string | null;
  blockingReasonBreakdown: { reason: string; count: number }[];
  officeCreationLog: { candidateId: string; officeName: string; outcome: OfficeCreationOutcome; explanation: string }[];
  candidates: CandidatePromotionDebug[];
  notes: string[];
  version: string;
}
