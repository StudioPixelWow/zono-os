// ============================================================================
// ZONO Orchestrator — step runner / logger. Times a step and converts thrown
// errors into a structured step result so a non-critical failure never aborts
// the whole pipeline.
// ============================================================================
import "server-only";
import type { OrchestratorStepResult, OrchestratorStepStatus } from "./types";

export interface StepOutcome {
  status?: OrchestratorStepStatus; // defaults to "success"
  summary: string;
}

/** Run a named step; on throw → status "failed" with the error message. */
export async function runStep(
  name: string,
  critical: boolean,
  fn: () => Promise<StepOutcome>,
): Promise<OrchestratorStepResult> {
  const t0 = Date.now();
  try {
    const out = await fn();
    return { name, status: out.status ?? "success", durationMs: Date.now() - t0, summary: out.summary, critical };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { name, status: "failed", durationMs: Date.now() - t0, summary: "step threw", error, critical };
  }
}

/** A pre-built "skipped" step (service unavailable in this context). */
export function skippedStep(name: string, summary: string, critical = false): OrchestratorStepResult {
  return { name, status: "skipped", durationMs: 0, summary, critical };
}
