// ============================================================================
// ZONO — Automation metrics + dashboard aggregation (pure, deterministic).
// Counts outcomes of executions/steps into business value (hours saved, etc.).
// ============================================================================
import type { AutomationMetrics, ExecutionStatusCounts, StepResult } from "./types";

// Minutes of manual work each automated action is estimated to save.
const MINUTES_SAVED: Record<string, number> = {
  create_task: 3, assign_user: 2, move_stage: 1, generate_ai_brief: 12, generate_whatsapp: 6,
  generate_email: 8, create_reminder: 2, schedule_meeting: 5, notify_manager: 3, create_alert: 2, update_journey: 2,
};

export function emptyCounts(): ExecutionStatusCounts {
  return { running: 0, completed: 0, failed: 0, waiting: 0, delayed: 0, cancelled: 0 };
}

export interface MetricsInput {
  actionCounts: Record<string, number>; // action_type → count of DONE steps
  executionsTotal: number;
  executionsSucceeded: number;
}

export function computeMetrics(i: MetricsInput): AutomationMetrics {
  const c = i.actionCounts;
  const tasksAutomated = (c.create_task ?? 0) + (c.create_reminder ?? 0);
  const whatsappsGenerated = c.generate_whatsapp ?? 0;
  const meetingsScheduled = c.schedule_meeting ?? 0;
  const remindersCreated = c.create_reminder ?? 0;
  // "Calls saved" ≈ AI briefs + whatsapp drafts that replace a manual prep call.
  const callsSaved = (c.generate_ai_brief ?? 0) + Math.round(whatsappsGenerated / 2);

  let minutes = 0;
  for (const [k, n] of Object.entries(c)) minutes += (MINUTES_SAVED[k] ?? 1) * n;
  const responseTimeSavedMinutes = (c.notify_manager ?? 0) * 10 + (c.create_alert ?? 0) * 5;

  const automationSuccessPct = i.executionsTotal > 0 ? Math.round((i.executionsSucceeded / i.executionsTotal) * 100) : 0;

  return {
    tasksAutomated, callsSaved, whatsappsGenerated, meetingsScheduled, remindersCreated,
    responseTimeSavedMinutes, hoursSaved: Math.round((minutes / 60) * 10) / 10, automationSuccessPct,
  };
}

/** Tally DONE action steps by type (for metrics). */
export function tallyActions(steps: StepResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of steps) {
    if (s.status === "done" && s.nodeKind === "action" && s.actionType && s.actionType !== "wait" && s.actionType !== "end") {
      out[s.actionType] = (out[s.actionType] ?? 0) + 1;
    }
  }
  return out;
}

export function slaCompliancePct(total: number, breached: number): number {
  if (total <= 0) return 100;
  return Math.round(((total - breached) / total) * 100);
}
