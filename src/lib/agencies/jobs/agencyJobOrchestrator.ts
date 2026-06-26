// ============================================================================
// ZONO — PHASE 26.11: Agency job orchestrator (SERVER-ONLY).
// Wires the 7 internal agency-intelligence steps into the canonical ordered
// pipeline, supplies real job runners + logging hooks, and persists one run row
// (running → final). Severity-aware: a critical-step failure aborts; non-critical
// failures continue and downgrade to partial_success. Idempotent (every step
// upserts), org-scoped, no destructive deletes, no external scraping.
// ============================================================================
import "server-only";
import {
  executeAgencyPipeline, CRITICAL_STEPS, AGENCY_PIPELINE_ORDER,
  type StepDef, type StepSummary, type AgencyJobStepName, type DailyAgencyIntelligenceResult,
} from "./agencyJobTypes";
import { createRunRow, finishRunRow, logStepStart, logStepEnd } from "./agencyJobLogger";
import { resolveAgentAgenciesJob } from "./resolveAgentAgenciesJob";
import { buildAgencyKnowledgeGraphJob } from "./buildAgencyKnowledgeGraphJob";
import { calculateAgencyTerritoryStatsJob } from "./calculateAgencyTerritoryStatsJob";
import { calculateAgencyScoresJob } from "./calculateAgencyScoresJob";
import { detectAgencySignalsJob } from "./detectAgencySignalsJob";
import { generateAgencyReportsJob } from "./generateAgencyReportsJob";
import { buildRainGraphJob } from "@/lib/rain/jobs/buildRainGraphJob";

export interface OrchestratorOptions { maxAgencies?: number }

const severity = (name: AgencyJobStepName) => (CRITICAL_STEPS.has(name) ? "critical" : "non_critical");

/** Build the ordered real step definitions (bounded so a request returns promptly). */
function buildStepDefs(opts: OrchestratorOptions): StepDef[] {
  const cap = { maxAgencies: Math.max(1, Math.min(opts.maxAgencies ?? 80, 400)) };
  const runners: Record<AgencyJobStepName, () => Promise<StepSummary>> = {
    resolve_agent_agencies: async () => {
      const r = await resolveAgentAgenciesJob({ maxCandidates: 100 });
      return { candidatesProcessed: r.candidatesProcessed, matched: r.matched, created: r.created, enriched: r.enriched, rejected: r.rejected, errors: r.errors.length };
    },
    build_knowledge_graph: async () => {
      const r = await buildAgencyKnowledgeGraphJob(cap);
      return { agenciesScanned: r.agenciesScanned, relationshipsCreated: r.relationshipsCreated, relationshipsUpdated: r.relationshipsUpdated, signalsCreated: r.signalsCreated, errors: r.errors.length };
    },
    calculate_territory_stats: async () => {
      const r = await calculateAgencyTerritoryStatsJob(cap);
      return { territoriesCalculated: r.territoriesCalculated, dominanceChanges: r.dominanceChanges, opportunitiesDetected: r.opportunitiesDetected, errors: r.errors.length };
    },
    calculate_scores: async () => {
      const r = await calculateAgencyScoresJob(cap);
      return { scoresCalculated: r.scoresCalculated, highThreatDetected: r.highThreatDetected, lowConfidenceScores: r.lowConfidenceScores, errors: r.errors.length };
    },
    detect_signals: async () => {
      const r = await detectAgencySignalsJob(cap);
      return { signalsCreated: r.signalsCreated, signalsUpdated: r.signalsUpdated, duplicatesSkipped: r.duplicatesSkipped, errors: r.errors.length };
    },
    generate_reports: async () => {
      const r = await generateAgencyReportsJob(cap);
      return { reportsCreated: r.reportsCreated, reportsUpdated: r.reportsUpdated, lowConfidenceReports: r.lowConfidenceReports, errors: r.errors.length };
    },
    build_rain_graph: async () => {
      const r = await buildRainGraphJob(cap);
      return { nodesCreated: r.nodes_created, nodesUpdated: r.nodes_updated, edgesCreated: r.edges_created, edgesUpdated: r.edges_updated, orphansSkipped: r.orphan_entities_skipped, errors: r.errors };
    },
  };
  return AGENCY_PIPELINE_ORDER.map((name) => ({ name, severity: severity(name), run: runners[name] }));
}

/**
 * Run the full ordered agency-intelligence pipeline for one organization and
 * persist a single run row. Returns the structured result.
 */
export async function runAgencyJobPipeline(organizationId: string, opts: OrchestratorOptions = {}): Promise<DailyAgencyIntelligenceResult> {
  const runId = await createRunRow(organizationId, "daily_agency_intelligence");
  const result = await executeAgencyPipeline(organizationId, buildStepDefs(opts), {
    onStepStart: (name) => logStepStart(organizationId, name),
    onStepEnd: (r) => logStepEnd(organizationId, r.name, r.status, r.durationMs, r.error),
  });
  await finishRunRow(runId, result);
  return result;
}
