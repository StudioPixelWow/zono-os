// ============================================================================
// ✅ Research Jobs self-tests (pure, offline). 26.4.15.
// Validates the resume/checkpoint math: stage ordering, first-pending (resume
// point), progress %, and that completed stages are skipped on resume.
// ============================================================================
import { JOB_STAGES, nextStage, firstPendingStage, stageProgress, type JobStage } from "./types";

export interface JobCheck { name: string; pass: boolean; detail: string }
export interface JobSelfCheck { ok: boolean; total: number; passed: number; checks: JobCheck[] }

export function runSelfCheck(): JobSelfCheck {
  const checks: JobCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  add("9 stages in order", JOB_STAGES.length === 9 && JOB_STAGES[0] === "INIT" && JOB_STAGES[8] === "SUMMARY", JOB_STAGES.join(">"));
  add("nextStage INIT→AI_SEED", nextStage("INIT") === "AI_SEED", `${nextStage("INIT")}`);
  add("nextStage SUMMARY→null", nextStage("SUMMARY") === null, `${nextStage("SUMMARY")}`);

  // Fresh job → resume point is INIT, progress 0.
  add("fresh → INIT / 0%", firstPendingStage([]) === "INIT" && stageProgress([]) === 0, "ok");

  // After AI_SEED done → resume skips to PUBLIC_SEARCH (AI is NOT re-run).
  const doneThroughSeed: JobStage[] = ["INIT", "AI_SEED"];
  add("resume skips AI_SEED", firstPendingStage(doneThroughSeed) === "PUBLIC_SEARCH", `${firstPendingStage(doneThroughSeed)}`);
  add("progress after 2 stages", stageProgress(doneThroughSeed) === Math.round((2 / 9) * 100), `${stageProgress(doneThroughSeed)}`);

  // Verify checkpoint: through VERIFY → resume at PROMOTE.
  const doneThroughVerify: JobStage[] = ["INIT", "AI_SEED", "PUBLIC_SEARCH", "EXTRACT", "VERIFY"];
  add("resume after VERIFY→PROMOTE", firstPendingStage(doneThroughVerify) === "PROMOTE", `${firstPendingStage(doneThroughVerify)}`);

  // All done → null / 100%.
  add("all done → null / 100%", firstPendingStage(JOB_STAGES) === null && stageProgress(JOB_STAGES) === 100, "ok");

  // Out-of-order completion still resumes at the earliest gap.
  const gap: JobStage[] = ["INIT", "AI_SEED", "PUBLIC_SEARCH", "VERIFY"]; // EXTRACT missing
  add("earliest gap resumes EXTRACT", firstPendingStage(gap) === "EXTRACT", `${firstPendingStage(gap)}`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
