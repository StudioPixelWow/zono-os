"use server";
// ============================================================================
// ZONO — PHASE 26.9: RAIN server actions. Thin, typed wrappers around the graph
// service. The build action runs the idempotent batch job for the current org.
// Read-only otherwise. No destructive actions.
// ============================================================================
import { currentOrgId } from "./_context";
import { buildRainGraphJob, type BuildRainGraphJobResult } from "./jobs/buildRainGraphJob";
import { getRainGraphOverview } from "./rainGraphService";
import type { RainStats, RainConfidenceSummary } from "./rainTypes";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function buildRainGraphAction(): Promise<Result<BuildRainGraphJobResult>> {
  try { return { ok: true, data: await buildRainGraphJob() }; }
  catch (e) { return fail(e); }
}

export async function getRainOverviewAction(): Promise<Result<{ stats: RainStats; confidence: RainConfidenceSummary }>> {
  try {
    const org = await currentOrgId();
    return { ok: true, data: await getRainGraphOverview(org) };
  } catch (e) { return fail(e); }
}
