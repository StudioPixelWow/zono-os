// ============================================================================
// ⚙️ ZONO — Automation OS™ · service (server-only). PHASE 46.0.
// Pure UNIFICATION over existing engines. Reuses the automation module's
// analytics + the Approval Bundle Engine's pending bundles. No new engine,
// no new table, no new approval. Nothing runs without the existing approval gate.
// ============================================================================
import "server-only";
import { getAutomationAnalytics } from "@/lib/automation/service";
import { getInboxBundles } from "@/lib/approval-bundle/service";
import { composeAutomationHealth, AUTOMATION_LIBRARY, type AutomationHealth, type AutomationTemplateRef } from "./unify";

const ZERO = { workflowsTotal: 0, workflowsEnabled: 0, runsTotal: 0, runsApplied: 0, pending: 0, completedToday: 0, failed: 0, blocked: 0 };

/** Unified automation health — REUSES automation analytics + pending approval bundles. */
export async function getAutomationHealth(): Promise<AutomationHealth> {
  const [analytics, bundles] = await Promise.all([
    getAutomationAnalytics().catch(() => null),
    getInboxBundles().catch(() => []),
  ]);
  const a = analytics ?? ZERO;
  return composeAutomationHealth(
    { workflowsTotal: a.workflowsTotal, workflowsEnabled: a.workflowsEnabled, runsTotal: a.runsTotal, runsApplied: a.runsApplied, pending: a.pending, completedToday: a.completedToday, failed: a.failed, blocked: a.blocked },
    bundles.length,
  );
}

export function getAutomationLibrary(): AutomationTemplateRef[] { return AUTOMATION_LIBRARY; }
