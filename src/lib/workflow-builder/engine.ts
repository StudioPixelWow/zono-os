// ============================================================================
// 🔁 Workflow Builder — state machine (pure). 30.4. Parts 1 + 6 + 7.
// Instantiates a workflow from a template + trigger + context, then advances it
// step-by-step on USER events (approve/reject/complete/block/cancel). Conditions
// auto-resolve; action steps become waiting_approval — NOTHING executes and no
// action step is completed without an explicit approve event. Pure + explainable.
// ============================================================================
import { evaluateCondition } from "./conditions";
import { getTemplate } from "./templates";
import {
  WORKFLOW_BUILDER_VERSION, TRIGGER_HE,
  type Workflow, type WorkflowStep, type WorkflowContext, type WorkflowEvent, type WorkflowProgress,
  type WorkflowExplain, type TriggerType, type EntityKind,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const TERMINAL = new Set(["completed", "skipped", "cancelled"]);
const nowIso = () => new Date().toISOString();

function computeProgress(wf: Workflow): WorkflowProgress {
  const total = wf.steps.length;
  const completed = wf.steps.filter((s) => s.status === "completed").length;
  const cancelled = wf.steps.filter((s) => s.status === "cancelled").length;
  const blocked = wf.steps.filter((s) => s.status === "blocked").length;
  const pending = wf.steps.filter((s) => s.status === "pending").length;
  const current = wf.steps.find((s) => s.status === "active" || s.status === "waiting_approval") ?? null;
  return { total, completed, pending, blocked, cancelled, percent: total ? clamp((completed / total) * 100) : 0, currentStepId: current?.id ?? null };
}

function buildExplain(wf: Workflow, tmplOutcome: string, ctx: WorkflowContext): WorkflowExplain {
  const waiting = wf.steps.find((s) => s.status === "waiting_approval");
  const active = wf.steps.find((s) => s.status === "active");
  const blocked = wf.steps.find((s) => s.status === "blocked");
  return {
    whyStarted: `הופעל ע"י טריגר "${TRIGGER_HE[wf.trigger]}" עבור ${wf.entityName}.`,
    whyWaiting: waiting ? `ממתין לאישור: ${waiting.title} — ${waiting.why}` : active ? `בביצוע: ${active.title}` : null,
    whyBlocked: blocked ? `חסום: ${blocked.title} — ${blocked.blockedReason ?? "תנאי לא מתקיים"}` : null,
    expectedOutcome: tmplOutcome,
    confidence: clamp(0.5 * ctx.confidence + 0.3 * (ctx.truthScore ?? 40) + 0.2 * ctx.businessScore),
  };
}

// Advance through auto-resolvable steps and position the active/waiting step.
function settle(wf: Workflow, ctx: WorkflowContext): void {
  if (wf.status === "cancelled") return;
  for (const step of wf.steps) {
    if (TERMINAL.has(step.status)) continue;
    if (step.status === "blocked") { wf.status = "blocked"; return; }

    if (step.kind === "condition" && step.condition) {
      const { pass, reason } = evaluateCondition(step.condition, ctx);
      if (pass) { step.status = "completed"; step.outcome = reason; continue; }
      step.status = "blocked"; step.blockedReason = reason; wf.status = "blocked"; return;
    }
    // Action / wait step — gate on approval; never auto-complete.
    step.status = step.requiresApproval ? "waiting_approval" : "active";
    wf.status = step.requiresApproval ? "waiting_approval" : "running";
    return;
  }
  // No non-terminal steps left.
  wf.status = wf.steps.some((s) => s.status === "blocked") ? "blocked" : "completed";
}

export function instantiateWorkflow(templateId: string, trigger: TriggerType, entity: { entityKind: EntityKind; entityId: string; entityName: string }, ctx: WorkflowContext): Workflow | null {
  const t = getTemplate(templateId);
  if (!t) return null;
  const steps: WorkflowStep[] = t.steps.map((s) => ({ ...s, status: "pending", blockedReason: null, outcome: null }));
  const wf: Workflow = {
    id: `wf:${templateId}:${entity.entityId}:${Date.now()}`, version: WORKFLOW_BUILDER_VERSION, createdAt: nowIso(),
    templateId, name: t.name, entityKind: entity.entityKind, entityId: entity.entityId, entityName: entity.entityName,
    trigger, status: "draft", steps,
    history: [{ at: nowIso(), stepId: null, event: "created", note: `נוצר מתבנית "${t.name}"` }],
    progress: { total: steps.length, completed: 0, pending: steps.length, blocked: 0, cancelled: 0, percent: 0, currentStepId: null },
    explain: { whyStarted: "", whyWaiting: null, whyBlocked: null, expectedOutcome: t.expectedOutcome, confidence: 0 },
  };
  settle(wf, ctx);
  wf.progress = computeProgress(wf);
  wf.explain = buildExplain(wf, t.expectedOutcome, ctx);
  return wf;
}

export function advanceWorkflow(input: Workflow, event: WorkflowEvent, ctx: WorkflowContext): Workflow {
  const wf: Workflow = structuredCloneSafe(input);
  const t = getTemplate(wf.templateId);
  const outcome = t?.expectedOutcome ?? "";
  const current = wf.steps.find((s) => s.status === "waiting_approval" || s.status === "active") ?? null;
  const target = event.stepId ? wf.steps.find((s) => s.id === event.stepId) ?? current : current;

  switch (event.kind) {
    case "approve":
      if (target && (target.status === "waiting_approval" || target.status === "active")) {
        target.status = "completed"; target.outcome = "אושר — ההצעה מוכנה למערכת המתאימה (משימה/טיוטה).";
        wf.history.push({ at: nowIso(), stepId: target.id, event: "approved", note: target.title });
        settle(wf, ctx);
      }
      break;
    case "reject":
      if (target) { target.status = "blocked"; target.blockedReason = event.note ?? "נדחה ע\"י המשתמש"; wf.status = "blocked"; wf.history.push({ at: nowIso(), stepId: target.id, event: "rejected", note: target.blockedReason }); }
      break;
    case "complete_step":
      if (target && !target.requiresApproval && (target.status === "active" || target.status === "waiting_approval")) {
        target.status = "completed"; target.outcome = "הושלם"; wf.history.push({ at: nowIso(), stepId: target.id, event: "completed", note: target.title }); settle(wf, ctx);
      }
      break;
    case "block":
      if (target) { target.status = "blocked"; target.blockedReason = event.note ?? "נחסם"; wf.status = "blocked"; wf.history.push({ at: nowIso(), stepId: target.id, event: "blocked", note: target.blockedReason }); }
      break;
    case "cancel":
      for (const s of wf.steps) if (!TERMINAL.has(s.status) && s.status !== "blocked") s.status = "cancelled";
      wf.status = "cancelled"; wf.history.push({ at: nowIso(), stepId: null, event: "cancelled", note: event.note ?? "בוטל" });
      break;
  }

  wf.progress = computeProgress(wf);
  wf.explain = buildExplain(wf, outcome, ctx);
  return wf;
}

// structuredClone is available in Node 18+/modern runtimes; guard for older ones.
function structuredCloneSafe<T>(v: T): T {
  return typeof structuredClone === "function" ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T);
}

export { computeProgress };
