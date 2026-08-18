// ============================================================================
// ZONO — Follow-up Engine: state model (PURE, deterministic, unit-testable).
// Given a lead + its real signals (open tasks, completed meeting needing a
// follow-up, upcoming meeting) it derives ONE authoritative follow-up state:
// customer-facing status, urgency, next action, overdue, escalation level, a
// plain-Hebrew reason, and — for the reconcile worker — which safe follow-up
// task (if any) is missing. No DB, no side effects, no LLM. Never fabricates.
// ============================================================================
import type { FollowUpPolicy } from "./policy";

export type FollowUpCustomerState =
  | "new_waiting"       // חדש — מחכה לחזרה
  | "in_progress"       // בטיפול
  | "awaiting_followup" // ממתין לפולואפ
  | "followup_overdue"  // פולואפ באיחור
  | "meeting_scheduled" // פגישה מתוכננת
  | "needs_action"      // דורש פעולה
  | "unassigned"        // ללא אחראי
  | "closed";           // סגור

export const FOLLOWUP_STATE_LABEL: Record<FollowUpCustomerState, string> = {
  new_waiting: "חדש — מחכה לחזרה",
  in_progress: "בטיפול",
  awaiting_followup: "ממתין לפולואפ",
  followup_overdue: "פולואפ באיחור",
  meeting_scheduled: "פגישה מתוכננת",
  needs_action: "דורש פעולה",
  unassigned: "ללא אחראי",
  closed: "סגור",
};

/** What safe follow-up task the reconcile worker should ensure exists. */
export type AutoTaskKind = "new_lead" | "post_meeting" | "hot_no_action";

/** Business event the reconcile worker should emit for this state (once/day). */
export type FollowUpEventKind =
  | "lead.followup_due" | "lead.followup_overdue" | "lead.unassigned"
  | "lead.hot_without_next_action" | "lead.sla_breached";

export interface FollowUpTaskSignal { id: string; title: string; dueAt: string | null }

export interface FollowUpLeadInput {
  id: string;
  stage: string;
  score: number | null;
  ownerId: string | null;
  lastMeaningfulContactAt: string | null;
  createdAt: string | null;
  fullName: string | null;
  source: string | null;
}

export interface FollowUpSignals {
  /** Open (todo/in_progress/blocked) tasks linked to this lead. */
  openTasks: FollowUpTaskSignal[];
  /** Nearest FUTURE meeting start for this lead, if any. */
  upcomingMeetingAt: string | null;
  /** A completed meeting for this lead with no follow-up task and no open task. */
  completedMeetingNeedingFollowUp: boolean;
}

export interface FollowUpNextAction { taskId: string; title: string; at: string | null; overdue: boolean }

export interface FollowUpState {
  leadId: string;
  leadName: string | null;
  source: string | null;
  stage: string;
  assignedUserId: string | null;
  state: FollowUpCustomerState;
  label: string;
  urgency: number;                 // 0..100
  hot: boolean;
  lastMeaningfulContactAt: string | null;
  nextAction: FollowUpNextAction | null;
  nextActionAt: string | null;
  overdueByHours: number | null;
  reason: string;                  // Hebrew, customer-facing
  escalationLevel: 0 | 1 | 2 | 3;
  /** Safe follow-up task the worker should ensure (null = nothing to auto-create). */
  needsAutoTask: AutoTaskKind | null;
  /** Business event the worker should emit for this state (null = none). */
  event: FollowUpEventKind | null;
}

const TERMINAL_STAGES = new Set(["converted", "lost", "disqualified"]);

function hoursBetween(iso: string | null, nowMs: number): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, (nowMs - t) / 3_600_000);
}
function minutesBetween(iso: string | null, nowMs: number): number {
  const h = hoursBetween(iso, nowMs);
  return Number.isFinite(h) ? h * 60 : Infinity;
}

function escalationFor(overdueHours: number, policy: FollowUpPolicy): 0 | 1 | 2 | 3 {
  if (overdueHours >= policy.escalation.managerHours) return 3;
  if (overdueHours >= policy.escalation.strongerHours) return 2;
  if (overdueHours >= policy.escalation.agentHours) return 1;
  return 1; // past the deadline at all → at least a gentle agent reminder
}

export function humanAge(iso: string | null, nowMs: number): string {
  const h = hoursBetween(iso, nowMs);
  if (!Number.isFinite(h)) return "";
  if (h < 1) return `${Math.max(1, Math.floor(h * 60))} דק׳`;
  if (h < 24) return `${Math.floor(h)} שעות`;
  const d = Math.floor(h / 24);
  if (d === 1) return "יום";
  if (d === 2) return "יומיים";
  if (d < 7) return `${d} ימים`;
  const w = Math.floor(d / 7);
  return w === 1 ? "שבוע" : `${w} שבועות`;
}

/**
 * Derive the authoritative follow-up state. Deterministic; decision order is
 * intentional (most-actionable state wins).
 */
export function computeFollowUpState(
  lead: FollowUpLeadInput,
  signals: FollowUpSignals,
  policy: FollowUpPolicy,
  nowMs: number,
): FollowUpState {
  const base = {
    leadId: lead.id,
    leadName: lead.fullName,
    source: lead.source,
    stage: lead.stage,
    assignedUserId: lead.ownerId,
    hot: (lead.score ?? 0) >= policy.hotScore,
    lastMeaningfulContactAt: lead.lastMeaningfulContactAt,
  };

  // Nearest open task by due date = the current "next action".
  const sortedOpen = [...signals.openTasks].sort((a, b) => {
    const ta = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const tb = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return ta - tb;
  });
  const nextTask = sortedOpen[0] ?? null;
  const nextOverdue = !!nextTask?.dueAt && new Date(nextTask.dueAt).getTime() < nowMs;
  const nextAction: FollowUpNextAction | null = nextTask
    ? { taskId: nextTask.id, title: nextTask.title, at: nextTask.dueAt, overdue: nextOverdue }
    : null;

  const mk = (
    state: FollowUpCustomerState,
    urgency: number,
    reason: string,
    escalationLevel: 0 | 1 | 2 | 3,
    needsAutoTask: AutoTaskKind | null,
    event: FollowUpEventKind | null,
    overdueByHours: number | null = null,
  ): FollowUpState => ({
    ...base,
    state,
    label: FOLLOWUP_STATE_LABEL[state],
    urgency: Math.max(0, Math.min(100, Math.round(urgency))),
    nextAction,
    nextActionAt: nextAction?.at ?? null,
    overdueByHours,
    reason,
    escalationLevel,
    needsAutoTask,
    event,
  });

  // 0) Terminal — automation stops.
  if (TERMINAL_STAGES.has(lead.stage)) return mk("closed", 0, "הליד סגור", 0, null, null);

  // 1) Unassigned active lead — the manager-facing exception (dominant).
  if (!lead.ownerId) return mk("unassigned", 55, "אין אחראי לליד", 1, null, "lead.unassigned");

  // 2) Overdue follow-up task.
  if (nextAction && nextAction.overdue) {
    const oh = hoursBetween(nextAction.at, nowMs);
    return mk("followup_overdue", 70 + Math.min(30, oh),
      `הפולואפ באיחור ${humanAge(nextAction.at, nowMs)}`,
      escalationFor(oh, policy), null, "lead.followup_overdue", Math.round(oh));
  }

  // 3) Completed meeting with no follow-up yet.
  if (signals.completedMeetingNeedingFollowUp) {
    return mk("needs_action", 60, "הסתיימה פגישה — צריך פולואפ", 1, "post_meeting", "lead.followup_due");
  }

  // 4) An upcoming meeting is the plan.
  if (signals.upcomingMeetingAt && !nextAction) {
    return mk("meeting_scheduled", 25, `פגישה מתוכננת בעוד ${humanAge(signals.upcomingMeetingAt, nowMs)}`, 0, null, null);
  }

  // 5) Has an open (future / current) task — being handled.
  if (nextAction) {
    const future = !!nextAction.at && new Date(nextAction.at).getTime() > nowMs;
    return future
      ? mk("awaiting_followup", 20, `הפעולה הבאה: ${nextAction.title}`, 0, null, null)
      : mk("in_progress", 22, `בטיפול — ${nextAction.title}`, 0, null, null);
  }

  // 6) Brand-new lead, never contacted → first-response SLA.
  const waitedMin = minutesBetween(lead.lastMeaningfulContactAt ?? lead.createdAt, nowMs);
  if (lead.stage === "new" && !lead.lastMeaningfulContactAt) {
    if (waitedMin > policy.firstResponseMinutes) {
      const oh = (waitedMin - policy.firstResponseMinutes) / 60;
      return mk("new_waiting", 65 + Math.min(30, oh * 2),
        `ליד חדש ממתין לחזרה ${humanAge(lead.createdAt, nowMs)}`,
        escalationFor(oh, policy), "new_lead", "lead.sla_breached", Math.round(oh));
    }
    return mk("new_waiting", 45, "ליד חדש — לחזור בהקדם", 0, "new_lead", null);
  }

  // 7) Active lead with NO next action → the core guarantee: something must be next.
  if (base.hot) {
    return mk("needs_action", 62, "ליד חם ללא פעולה הבאה", 1, "hot_no_action", "lead.hot_without_next_action");
  }
  const staleH = hoursBetween(lead.lastMeaningfulContactAt, nowMs);
  if (Number.isFinite(staleH) && staleH >= policy.staleDays * 24) {
    return mk("needs_action", 42, `לא הייתה פעילות ${humanAge(lead.lastMeaningfulContactAt, nowMs)}`, 1, null, "lead.followup_due");
  }
  return mk("needs_action", 35, "אין פעולה הבאה מוגדרת", 0, null, "lead.followup_due");
}
