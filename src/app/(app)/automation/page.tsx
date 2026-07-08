import { getAutomationCommandCenter, type AutomationCommandCenter } from "@/lib/automation/service";
import { getAutomationHealth } from "@/lib/automation-os/service";
import type { AutomationHealth } from "@/lib/automation-os/unify";
import { AutomationView } from "./AutomationView";

export const dynamic = "force-dynamic";

const EMPTY: AutomationCommandCenter = {
  workflows: [], runs: [], templates: [], recommendations: [],
  analytics: { workflowsTotal: 0, workflowsEnabled: 0, runsTotal: 0, runsApplied: 0, pending: 0, completedToday: 0, failed: 0, blocked: 0, tasksGenerated: 0, opportunitiesGenerated: 0 },
  isManager: false,
};

export default async function AutomationPage() {
  let cc: AutomationCommandCenter = EMPTY;
  try {
    cc = await getAutomationCommandCenter();
  } catch (e) {
    console.error("[automation] load failed:", e);
  }
  // Unified automation health (state / success + approval rates) — reused from
  // Automation OS, never recomputed. Null on failure → honest fallback in the view.
  const health: AutomationHealth | null = await getAutomationHealth().catch(() => null);
  return <AutomationView cc={cc} health={health} />;
}
