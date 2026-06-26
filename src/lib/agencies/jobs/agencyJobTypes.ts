// ============================================================================
// ZONO — PHASE 26.11: Daily Agency Intelligence Job™ — types + PURE executor.
// Client-safe (no IO, no server-only): the pipeline executor takes injected
// async step runners so the ordering / severity / partial-success logic is
// unit-tested directly. Real orchestration (in agencyJobOrchestrator) supplies
// the real job runners + logging hooks.
// ============================================================================

export type AgencyJobStatus = "queued" | "running" | "success" | "partial_success" | "failed";
export type StepSeverity = "critical" | "non_critical";
export type StepStatus = "success" | "failed" | "skipped";

export type AgencyJobStepName =
  | "resolve_agent_agencies"
  | "build_knowledge_graph"
  | "calculate_territory_stats"
  | "calculate_scores"
  | "detect_signals"
  | "generate_reports"
  | "build_rain_graph";

/** Canonical ordered pipeline (the exact run order). */
export const AGENCY_PIPELINE_ORDER: AgencyJobStepName[] = [
  "resolve_agent_agencies",
  "build_knowledge_graph",
  "calculate_territory_stats",
  "calculate_scores",
  "detect_signals",
  "generate_reports",
  "build_rain_graph",
];

/** Steps whose failure aborts the pipeline and marks the run "failed". */
export const CRITICAL_STEPS: ReadonlySet<AgencyJobStepName> = new Set<AgencyJobStepName>([
  "build_knowledge_graph",
  "calculate_scores",
]);

export type JsonScalar = string | number | boolean | null;
export type StepSummary = Record<string, JsonScalar>;

export interface AgencyJobStepResult {
  name: AgencyJobStepName;
  status: StepStatus;
  severity: StepSeverity;
  durationMs: number;
  summary: StepSummary;
  error?: string;
}

export interface DailyAgencyIntelligenceResult {
  status: AgencyJobStatus;
  organizationId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: AgencyJobStepResult[];
  errors: string[];
  summary: {
    stepsRun: number;
    stepsSucceeded: number;
    stepsFailed: number;
    stepsSkipped: number;
    criticalFailure: boolean;
  };
}

/** A step definition: an ordered runner that returns a numeric summary or throws. */
export interface StepDef {
  name: AgencyJobStepName;
  severity: StepSeverity;
  run: () => Promise<StepSummary>;
}

export interface PipelineHooks {
  onStepStart?: (name: AgencyJobStepName) => void;
  onStepEnd?: (result: AgencyJobStepResult) => void;
}

/** Redact obvious secrets from a free-text error message. */
export function redactMessage(msg: string): string {
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/\b(?:apikey|api_key|token|secret|password)\b\s*[:=]\s*\S+/gi, "$1=***")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "***");
}

/** Roll up a final status from per-step results (severity-aware). */
export function rollupStatus(steps: AgencyJobStepResult[]): AgencyJobStatus {
  const criticalFailed = steps.some((s) => s.status === "failed" && s.severity === "critical");
  if (criticalFailed) return "failed";
  const anyFailed = steps.some((s) => s.status === "failed");
  return anyFailed ? "partial_success" : "success";
}

/**
 * Execute the ordered steps. A critical-step failure stops the pipeline (the
 * remaining steps are marked "skipped"); a non-critical failure continues and
 * downgrades the overall status to "partial_success". Never throws.
 */
export async function executeAgencyPipeline(organizationId: string, steps: StepDef[], hooks: PipelineHooks = {}): Promise<DailyAgencyIntelligenceResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const results: AgencyJobStepResult[] = [];
  let aborted = false;

  for (const step of steps) {
    if (aborted) {
      const skipped: AgencyJobStepResult = { name: step.name, status: "skipped", severity: step.severity, durationMs: 0, summary: {} };
      results.push(skipped);
      hooks.onStepEnd?.(skipped);
      continue;
    }
    hooks.onStepStart?.(step.name);
    const s0 = Date.now();
    try {
      const summary = await step.run();
      const ok: AgencyJobStepResult = { name: step.name, status: "success", severity: step.severity, durationMs: Date.now() - s0, summary };
      results.push(ok);
      hooks.onStepEnd?.(ok);
    } catch (e) {
      const fail: AgencyJobStepResult = {
        name: step.name, status: "failed", severity: step.severity, durationMs: Date.now() - s0,
        summary: {}, error: redactMessage(e instanceof Error ? e.message : String(e)),
      };
      results.push(fail);
      hooks.onStepEnd?.(fail);
      if (step.severity === "critical") aborted = true;
    }
  }

  const status = rollupStatus(results);
  const finishedAt = new Date().toISOString();
  return {
    status, organizationId, startedAt, finishedAt, durationMs: Date.now() - t0,
    steps: results,
    errors: results.filter((s) => s.status === "failed").map((s) => `${s.name}: ${s.error ?? "failed"}`),
    summary: {
      stepsRun: results.filter((s) => s.status !== "skipped").length,
      stepsSucceeded: results.filter((s) => s.status === "success").length,
      stepsFailed: results.filter((s) => s.status === "failed").length,
      stepsSkipped: results.filter((s) => s.status === "skipped").length,
      criticalFailure: status === "failed",
    },
  };
}
