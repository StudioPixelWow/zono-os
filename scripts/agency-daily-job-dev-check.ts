/**
 * LOCAL-DEV-ONLY check for the Daily Agency Intelligence pipeline (Phase 26.11).
 * Pure executor only (no DB, no real jobs). Verifies: canonical pipeline order ·
 * successful run · partial failure (non-critical) · full failure (critical abort
 * + skipped tail) · per-step logging hooks · idempotent/deterministic execution ·
 * runners invoked exactly once (no hidden external calls) · secret redaction.
 *
 * Run: npx tsx scripts/agency-daily-job-dev-check.ts
 */
import {
  executeAgencyPipeline, rollupStatus, redactMessage, AGENCY_PIPELINE_ORDER, CRITICAL_STEPS,
  type StepDef, type AgencyJobStepName, type AgencyJobStepResult,
} from "../src/lib/agencies/jobs/agencyJobTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function makeSteps(opts: { throwOn?: AgencyJobStepName; calls: AgencyJobStepName[]; counts: Map<AgencyJobStepName, number> }): StepDef[] {
  return AGENCY_PIPELINE_ORDER.map((name) => ({
    name,
    severity: CRITICAL_STEPS.has(name) ? "critical" : "non_critical",
    run: async () => {
      opts.calls.push(name);
      opts.counts.set(name, (opts.counts.get(name) ?? 0) + 1);
      if (opts.throwOn === name) throw new Error(`boom token=SECRET123 at ${name}`);
      return { processed: 1 };
    },
  }));
}

async function main(): Promise<void> {
  console.log("Daily Agency Intelligence pipeline dev-check\n");

  // 1) Canonical order.
  console.log("Pipeline order:");
  assert(JSON.stringify(AGENCY_PIPELINE_ORDER) === JSON.stringify([
    "resolve_agent_agencies", "build_knowledge_graph", "calculate_territory_stats",
    "calculate_scores", "detect_signals", "generate_reports", "build_rain_graph",
  ]), "AGENCY_PIPELINE_ORDER matches the exact spec order");
  assert(CRITICAL_STEPS.has("build_knowledge_graph") && CRITICAL_STEPS.has("calculate_scores"), "graph + scores are the critical steps");

  // 2) Successful run.
  console.log("\nSuccessful run:");
  const okCalls: AgencyJobStepName[] = []; const okCounts = new Map<AgencyJobStepName, number>();
  const okRes = await executeAgencyPipeline("org1", makeSteps({ calls: okCalls, counts: okCounts }));
  assert(JSON.stringify(okCalls) === JSON.stringify(AGENCY_PIPELINE_ORDER), "steps execute in pipeline order");
  assert(okRes.status === "success" && okRes.summary.stepsSucceeded === 7, "all steps succeed → status success");
  assert([...okCounts.values()].every((c) => c === 1), "each step runner invoked exactly once (no hidden external calls)");

  // 3) Logging hooks.
  console.log("\nLogging hooks:");
  const starts: string[] = []; const ends: string[] = [];
  await executeAgencyPipeline("org1", makeSteps({ calls: [], counts: new Map() }), {
    onStepStart: (n) => starts.push(n), onStepEnd: (r) => ends.push(r.name),
  });
  assert(starts.length === 7 && ends.length === 7, "onStepStart + onStepEnd fired for every step");

  // 4) Partial failure (non-critical step throws).
  console.log("\nPartial failure (non-critical):");
  const pCalls: AgencyJobStepName[] = [];
  const pRes = await executeAgencyPipeline("org1", makeSteps({ throwOn: "detect_signals", calls: pCalls, counts: new Map() }));
  assert(pRes.status === "partial_success", "non-critical failure → partial_success");
  assert(pCalls.includes("generate_reports") && pCalls.includes("build_rain_graph"), "pipeline CONTINUES after a non-critical failure");
  assert(pRes.steps.find((s) => s.name === "detect_signals")?.status === "failed", "the failing step is marked failed");
  assert(pRes.summary.stepsSkipped === 0, "no steps skipped on non-critical failure");

  // 5) Full failure (critical step aborts).
  console.log("\nFull failure (critical):");
  const cCalls: AgencyJobStepName[] = [];
  const cRes = await executeAgencyPipeline("org1", makeSteps({ throwOn: "calculate_scores", calls: cCalls, counts: new Map() }));
  assert(cRes.status === "failed", "critical failure → failed");
  assert(!cCalls.includes("detect_signals") && !cCalls.includes("build_rain_graph"), "pipeline STOPS after a critical failure");
  const tail = cRes.steps.filter((s) => ["detect_signals", "generate_reports", "build_rain_graph"].includes(s.name));
  assert(tail.every((s) => s.status === "skipped"), "remaining steps after critical failure are marked skipped");
  assert(cRes.summary.criticalFailure === true, "summary flags criticalFailure");

  // 6) Idempotent / deterministic.
  console.log("\nDeterminism:");
  const a = await executeAgencyPipeline("org1", makeSteps({ calls: [], counts: new Map() }));
  const b = await executeAgencyPipeline("org1", makeSteps({ calls: [], counts: new Map() }));
  const shape = (r: { steps: AgencyJobStepResult[]; status: string }) => r.status + "|" + r.steps.map((s) => `${s.name}:${s.status}`).join(",");
  assert(shape(a) === shape(b), "identical runners → identical pipeline shape (idempotent orchestration)");
  assert(rollupStatus([{ name: "calculate_scores", status: "failed", severity: "critical", durationMs: 0, summary: {} }]) === "failed", "rollupStatus: critical fail → failed");

  // 7) Secret redaction.
  console.log("\nRedaction:");
  assert(redactMessage("auth Bearer abc.def-123 done").includes("Bearer ***"), "Bearer tokens redacted from messages");
  assert(cRes.errors[0].includes("***") && !cRes.errors[0].includes("SECRET123"), "secrets redacted in surfaced step errors");

  console.log(`\n${failures === 0 ? "✅ ALL DAILY JOB CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
