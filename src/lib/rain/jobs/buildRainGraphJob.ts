// ============================================================================
// ZONO — PHASE 26.9: RAIN graph batch job (SERVER-ONLY).
// Rebuilds the strategic intelligence graph for the current org. Rules:
// idempotent · bounded/safe pagination via caps · NO destructive deletion (only
// upserts existing nodes/edges) · logs counts. Failures inside any stage are
// isolated by the builder and surfaced as errors without aborting the run.
// ============================================================================
import "server-only";
import { currentOrgId } from "../_context";
import { buildRainGraphForOrganization } from "../rainGraphService";
import type { BuildRainOptions } from "../rainGraphBuilder";

export interface BuildRainGraphJobResult {
  nodes_created: number;
  nodes_updated: number;
  edges_created: number;
  edges_updated: number;
  orphan_entities_skipped: number;
  errors: number;
  error_details: { stage: string; message: string }[];
}

export async function buildRainGraphJob(opts: BuildRainOptions = {}): Promise<BuildRainGraphJobResult> {
  const org = await currentOrgId();
  const r = await buildRainGraphForOrganization(org, opts);
  const out: BuildRainGraphJobResult = {
    nodes_created: r.nodesCreated,
    nodes_updated: r.nodesUpdated,
    edges_created: r.edgesCreated,
    edges_updated: r.edgesUpdated,
    orphan_entities_skipped: r.orphanEntitiesSkipped,
    errors: r.errors.length,
    error_details: r.errors,
  };
  console.log("[rain] buildRainGraphJob", JSON.stringify(out));
  return out;
}
