// ============================================================================
// 🗂️ Persistent Background Research Jobs™ — public surface. 26.4.15.
// City research runs as a resumable, checkpointed background job so no single
// serverless request must finish it. Reuses the Brokerage Research Agent +
// City Discovery + persistent KB. No valuation/BIE/MAI/rule changes.
// ============================================================================
export {
  createBrokerageResearchJob, runBrokerageResearchJob, resumeBrokerageResearchJob,
  getBrokerageResearchJobStatus, getLatestCityResearchJob, cancelBrokerageResearchJob,
  type JobResult,
} from "./service";
export { runSelfCheck, type JobSelfCheck, type JobCheck } from "./qa";
export {
  JOB_STAGES, JOB_STAGE_HE, JOB_STATUS_HE, nextStage, firstPendingStage, stageProgress,
  RESEARCH_JOBS_VERSION,
} from "./types";
export type {
  JobStatus, JobStage, JobStageLog, JobCheckpoints, JobCounts, ResearchJob,
  CreateJobOptions, ResearchDepth,
} from "./types";
