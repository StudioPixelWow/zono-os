// ============================================================================
// 🗂️ Persistent Background Research Jobs™ — types (client-safe, pure). 26.4.15.
// ----------------------------------------------------------------------------
// A city research job is resumable + checkpointed: it survives serverless
// timeouts and continues from the last completed stage on the next run. Reuses
// the Brokerage Research Agent for the actual work. No valuation/BIE/MAI/rule
// changes.
// ============================================================================
import type { ResearchDepth } from "../research-agent/types";

export const RESEARCH_JOBS_VERSION = "26.4.15";
export type { ResearchDepth };

export type JobStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";

// The 9 checkpointed stages, in order.
export type JobStage =
  | "INIT" | "AI_SEED" | "PUBLIC_SEARCH" | "EXTRACT" | "VERIFY"
  | "PROMOTE" | "MATCH_BROKERS" | "RELINK_LISTINGS" | "SUMMARY";

export const JOB_STAGES: JobStage[] = [
  "INIT", "AI_SEED", "PUBLIC_SEARCH", "EXTRACT", "VERIFY",
  "PROMOTE", "MATCH_BROKERS", "RELINK_LISTINGS", "SUMMARY",
];

/** The stage after `stage`, or null if it's the last. Pure. */
export function nextStage(stage: JobStage): JobStage | null {
  const i = JOB_STAGES.indexOf(stage);
  return i >= 0 && i + 1 < JOB_STAGES.length ? JOB_STAGES[i + 1] : null;
}
/** First stage not yet completed (resume point), or null when all done. Pure. */
export function firstPendingStage(stagesDone: JobStage[]): JobStage | null {
  return JOB_STAGES.find((st) => !stagesDone.includes(st)) ?? null;
}
/** Progress % from completed stages. Pure. */
export function stageProgress(stagesDone: JobStage[]): number {
  const done = JOB_STAGES.filter((st) => stagesDone.includes(st)).length;
  return Math.round((done / JOB_STAGES.length) * 100);
}

export interface JobStageLog {
  stage: JobStage; startedAt: string; finishedAt: string; durationMs: number;
  itemsProcessed: number; error: string | null; nextStage: JobStage | null;
}

export interface JobCheckpoints {
  stagesDone: JobStage[];
  searchStageIndex?: number;        // chunked staged search cursor
  verifiedIds?: string[];           // candidate ids already verify-attempted this job
  discoveredCount?: number;
}

export interface JobCounts {
  searchesCompleted: number;
  candidatesFound: number;
  candidatesSaved: number;
  candidatesVerified: number;
  candidatesResearching: number;
  candidatesWaitingForEvidence: number;
  candidatesRejected: number;
}

export interface ResearchJob extends JobCounts {
  id: string;
  organizationId: string | null;
  city: string; normalizedCity: string;
  status: JobStatus;
  depth: ResearchDepth;
  currentStage: JobStage;
  progressPercent: number;
  errors: { stage: JobStage; message: string; at: string }[];
  checkpoints: JobCheckpoints;
  logs: JobStageLog[];
  resultSummary: Record<string, unknown> | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  createdBy: string | null;
}

export interface CreateJobOptions { depth?: ResearchDepth; createdBy?: string | null }

// Human-readable stage labels for the UI.
export const JOB_STAGE_HE: Record<JobStage, string> = {
  INIT: "אתחול", AI_SEED: "הצעת מועמדים (AI)", PUBLIC_SEARCH: "חיפוש ציבורי",
  EXTRACT: "חילוץ שמות", VERIFY: "אימות ציבורי", PROMOTE: "קידום למאומת",
  MATCH_BROKERS: "שיוך מתווכים", RELINK_LISTINGS: "קישור מודעות", SUMMARY: "סיכום",
};
export const JOB_STATUS_HE: Record<JobStatus, string> = {
  queued: "בתור", running: "רץ", waiting: "ממתין (ניתן להמשיך)",
  completed: "הושלם", failed: "נכשל", cancelled: "בוטל",
};
