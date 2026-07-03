// ============================================================================
// 🔁 Workflow Builder — approval-execution planner (pure). 30.4.1.
// Maps an APPROVED action step to what should be created in the EXISTING systems
// (Mission Engine / Draft Studio). Pure + testable — the side effects live in
// persist.ts. Every created mission/draft is itself approval-gated; nothing here
// executes anything.
// ============================================================================
import type { WorkflowStep, EntityKind } from "./types";

export type ExecKind = "mission" | "draft" | "note";
export interface ExecutionPlan { kind: ExecKind; missionType: string | null; entityType: string; reason: string; note: string }

const KIND_TO_ENTITY: Record<EntityKind, string> = {
  buyer: "buyer", seller: "seller", lead: "lead", broker: "broker", office: "office", property: "property", mission: "organization", customer: "buyer",
};

export function planExecution(step: WorkflowStep, entityKind: EntityKind): ExecutionPlan {
  const entityType = KIND_TO_ENTITY[entityKind] ?? "organization";
  const mt = step.missionType ?? "GENERAL";
  switch (step.action) {
    case "CREATE_MISSION":
    case "CREATE_TASK":
    case "SCHEDULE_FOLLOWUP":
      return { kind: "mission", missionType: mt, entityType, reason: `נוצר מתהליך: ${step.title}`, note: "משימה נוצרה (ממתינה לאישור)" };
    case "CREATE_DRAFT":
      return { kind: "draft", missionType: mt, entityType, reason: `טיוטה מתהליך: ${step.title}`, note: "טיוטה הוכנה בסטודיו (ממתינה לאישור)" };
    case "REQUEST_APPROVAL":
      return { kind: "note", missionType: null, entityType, reason: step.title, note: "אושר — ניתן להמשיך" };
    case "NOTIFY_USER":
      return { kind: "note", missionType: null, entityType, reason: step.title, note: "התרעה נרשמה" };
    default:
      return { kind: "note", missionType: null, entityType, reason: step.title, note: "אין פעולה חיצונית" };
  }
}

// Offline self-check (pure).
export function runExecutionSelfCheck(): { ok: boolean; total: number; passed: number; checks: { name: string; pass: boolean }[] } {
  const checks: { name: string; pass: boolean }[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  const step = (action: WorkflowStep["action"], missionType: string | null = "X"): WorkflowStep => ({ id: "s", order: 1, title: "צעד", kind: "action", action, missionType, condition: null, requiresApproval: true, status: "completed", why: "", blockedReason: null, outcome: null });

  add("CREATE_MISSION → mission", planExecution(step("CREATE_MISSION"), "buyer").kind === "mission");
  add("CREATE_TASK → mission", planExecution(step("CREATE_TASK"), "lead").kind === "mission");
  add("SCHEDULE_FOLLOWUP → mission", planExecution(step("SCHEDULE_FOLLOWUP"), "seller").kind === "mission");
  add("CREATE_DRAFT → draft", planExecution(step("CREATE_DRAFT"), "buyer").kind === "draft");
  add("REQUEST_APPROVAL → note (no external create)", planExecution(step("REQUEST_APPROVAL", null), "lead").kind === "note");
  add("NOTIFY_USER → note", planExecution(step("NOTIFY_USER", null), "office").kind === "note");
  add("entity mapping buyer→buyer", planExecution(step("CREATE_MISSION"), "buyer").entityType === "buyer");
  add("entity mapping customer→buyer", planExecution(step("CREATE_MISSION"), "customer").entityType === "buyer");
  add("entity mapping property→property", planExecution(step("CREATE_MISSION"), "property").entityType === "property");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
