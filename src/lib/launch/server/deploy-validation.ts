// ============================================================================
// ZONO — deployment validation (server-only). One call that verifies the full
// runtime surface (DB, env, cron, health, queues, maps, AI, providers, storage,
// realtime, feature flags, RLS) and returns PASS / WARNING / FAIL per gate plus
// an overall verdict. Used by the /launch-readiness page and the deploy script.
// ============================================================================
import "server-only";
import { runDiagnostics, getProductionScore } from "./services";
import type { DiagStatus, GateLevel, GateResult } from "../types";

const DIAG_TO_GATE: Record<DiagStatus, GateLevel> = { pass: "PASS", warning: "WARNING", fail: "FAIL", unknown: "WARNING" };

export interface DeploymentValidation {
  gates: GateResult[];
  overall: GateLevel;
  launchReadinessPercent: number;
}

export async function runDeploymentValidation(): Promise<DeploymentValidation> {
  const [{ score }, diagnostics] = await Promise.all([getProductionScore(), runDiagnostics()]);

  const gates: GateResult[] = diagnostics.checks.map((c) => ({
    name: c.label,
    level: DIAG_TO_GATE[c.status],
    detail: c.detail ?? (c.status === "pass" ? "OK" : c.status),
  }));

  const hasFail = gates.some((g) => g.level === "FAIL");
  const hasWarn = gates.some((g) => g.level === "WARNING");
  const overall: GateLevel = hasFail ? "FAIL" : hasWarn ? "WARNING" : "PASS";

  return { gates, overall, launchReadinessPercent: score.launchReadinessPercent };
}
