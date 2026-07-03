// ============================================================================
// 🔁 ZONO — Persistent Workflow Execution — service (server-only). 30.4.1.
// Starts + persists workflows, advances persisted workflows, and — ONLY when a
// user approves an action step — creates the corresponding mission (Mission
// Engine) or draft (Draft Studio). Created missions/drafts are THEMSELVES
// approval-gated (WAITING_FOR_APPROVAL / never sent). Nothing auto-executes.
// Reuses the pure Workflow engine + the existing engines; no engine modified.
// ============================================================================
import "server-only";
import { instantiateWorkflow, advanceWorkflow } from "./engine";
import { getTemplate } from "./templates";
import { buildWorkflowContext, type WorkflowTarget } from "./service";
import { planExecution } from "./execution";
import { insertWorkflow, loadWorkflow, saveAdvance, listWorkflows, type WorkflowSummaryRow } from "./repository";
import { createMission } from "@/lib/mission-engine";
import { generateDraft } from "@/lib/draft-studio";
import type { Workflow, WorkflowEvent, WorkflowHistoryEntry, WorkflowStatus } from "./types";

export interface StartResult { ok: boolean; workflow?: Workflow; migrationRequired?: boolean; error?: string }
export interface AdvanceResult { ok: boolean; workflow?: Workflow; error?: string }

/** Start + persist a workflow (real context from the existing engines). */
export async function startPersistentWorkflow(orgId: string | null, templateId: string, target: WorkflowTarget, createdBy: string | null): Promise<StartResult> {
  const t = getTemplate(templateId);
  if (!t) return { ok: false, error: "תבנית לא נמצאה." };
  const context = await buildWorkflowContext(orgId, target);
  const wf = instantiateWorkflow(templateId, t.trigger, target, context);
  if (!wf) return { ok: false, error: "יצירת התהליך נכשלה." };
  const ins = await insertWorkflow(orgId, wf, context, createdBy);
  if (!ins.ok) return { ok: false, migrationRequired: ins.migrationRequired, error: ins.error };
  return { ok: true, workflow: { ...wf, id: ins.id ?? wf.id } };
}

/** Advance a persisted workflow; execute approved action steps via existing systems. */
export async function advancePersistentWorkflow(orgId: string | null, workflowId: string, event: WorkflowEvent, createdBy: string | null): Promise<AdvanceResult> {
  const loaded = await loadWorkflow(workflowId);
  if (!loaded) return { ok: false, error: "תהליך לא נמצא." };
  const { workflow: before, context, createdMissionByStep } = loaded;

  const after = advanceWorkflow(before, event, context);
  const extraHistory: WorkflowHistoryEntry[] = [];

  // Execute ONLY steps that JUST transitioned to completed via this approval.
  if (event.kind === "approve" || event.kind === "complete_step") {
    const beforeById = new Map(before.steps.map((s) => [s.id, s.status]));
    for (const step of after.steps) {
      if (step.kind !== "action") continue;
      if (step.status === "completed" && beforeById.get(step.id) !== "completed") {
        const plan = planExecution(step, after.entityKind);
        try {
          if (plan.kind === "mission") {
            const r = await createMission({ organizationId: orgId, entityType: plan.entityType, entityId: after.entityId, entityName: after.entityName, missionType: step.missionType ?? "GENERAL", reason: plan.reason, businessImpact: "medium", confidence: after.explain.confidence, createdBy });
            if (r.ok && r.mission) { createdMissionByStep[step.id] = r.mission.id; step.outcome = `${step.outcome ?? "אושר"} · משימה נוצרה (${r.mission.id.slice(0, 8)}) — ממתינה לאישור`; extraHistory.push({ at: new Date().toISOString(), stepId: step.id, event: "executed", note: `mission:${r.mission.id}` }); }
            else step.outcome = `${step.outcome ?? "אושר"} · ${r.migrationRequired ? "טבלת המשימות חסרה" : "יצירת משימה נכשלה"}`;
          } else if (plan.kind === "draft") {
            const bundle = await generateDraft(orgId, { entityKind: after.entityKind, entityId: after.entityId, name: after.entityName }, { channel: "whatsapp", purpose: "follow_up", tone: "professional", language: "he" }, { brokerName: null, officeName: null });
            step.outcome = `${step.outcome ?? "אושר"} · טיוטה הוכנה (${Object.keys(bundle.versions).length + 1} גרסאות) — פתח בסטודיו`;
            extraHistory.push({ at: new Date().toISOString(), stepId: step.id, event: "executed", note: "draft_prepared" });
          } else {
            step.outcome = `${step.outcome ?? "אושר"} · ${plan.note}`;
          }
        } catch { step.outcome = `${step.outcome ?? "אושר"} · הביצוע נכשל (נשמר לאישור ידני)`; }
      }
    }
  }

  const newHistory = after.history.slice(before.history.length).concat(extraHistory);
  await saveAdvance(after, newHistory, createdMissionByStep);
  return { ok: true, workflow: { ...after, history: [...after.history, ...extraHistory] } };
}

export async function getPersistentWorkflow(workflowId: string): Promise<Workflow | null> {
  const loaded = await loadWorkflow(workflowId);
  return loaded?.workflow ?? null;
}

const ACTIVE: WorkflowStatus[] = ["draft", "running", "waiting_approval", "blocked"];
const DONE: WorkflowStatus[] = ["completed", "cancelled"];

export async function listActiveWorkflows(orgId: string | null): Promise<{ rows: WorkflowSummaryRow[]; migrationRequired: boolean }> { return listWorkflows(orgId, ACTIVE); }
export async function listCompletedWorkflows(orgId: string | null): Promise<{ rows: WorkflowSummaryRow[]; migrationRequired: boolean }> { return listWorkflows(orgId, DONE); }
export async function listPendingApprovalWorkflows(orgId: string | null): Promise<{ rows: WorkflowSummaryRow[]; migrationRequired: boolean }> { return listWorkflows(orgId, ["waiting_approval"]); }
