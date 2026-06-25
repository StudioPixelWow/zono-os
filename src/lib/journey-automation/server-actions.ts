"use server";
// ============================================================================
// ZONO — Journey Automation server actions (org-scoped, manager+ to manage).
// Dashboard fetch, workflow CRUD/versioning, simulate, manual dispatch, cancel,
// seed templates, SLA rules, and the delay-queue runner.
// ============================================================================
import { revalidatePath } from "next/cache";
import { getJourneyAccess, assertManage } from "./permissions";
import { createJourneyRepository } from "./repository";
import { dispatchForOrg, simulate, runJourneyDelayQueue } from "./orchestrator";
import { validateGraph } from "./engine";
import { computeMetrics } from "./metrics";
import { tallyActionsFromCounts, buildDashboard } from "./dashboard";
import { DEFAULT_JOURNEYS } from "./templates";
import type { AutomationDashboard, ExecutionResult, TriggerEvent, WorkflowGraph } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }

export async function getJourneyDashboardAction(): Promise<Result<AutomationDashboard>> {
  try {
    const a = await getJourneyAccess();
    const repo = createJourneyRepository(a.db);
    const [rows, names, actionCounts, audit] = await Promise.all([
      repo.executionRows(a.orgId, 400), repo.workflowNames(a.orgId), repo.doneActionStepCounts(a.orgId), repo.recentAudit(a.orgId, 40),
    ]);
    const metrics = computeMetrics(tallyActionsFromCounts(actionCounts, rows.length));
    return { ok: true, data: buildDashboard(rows, names, audit, metrics) };
  } catch (e) { return fail(e); }
}

export async function getJourneyWorkflowsAction(): Promise<Result<{ id: string; name: string; journeyType: string; status: string; activeVersion: number; triggerType: string | null }[]>> {
  try {
    const a = await getJourneyAccess();
    const rows = await createJourneyRepository(a.db).listWorkflows(a.orgId);
    return { ok: true, data: rows.map((w) => ({ id: w.id, name: w.name, journeyType: w.journey_type, status: w.status, activeVersion: w.active_version, triggerType: w.trigger_type })) };
  } catch (e) { return fail(e); }
}

export async function createJourneyAction(input: { name: string; description?: string; journeyType: string; triggerType: string | null; graph: WorkflowGraph; activate?: boolean }): Promise<Result<{ id: string }>> {
  try {
    const a = await getJourneyAccess(); assertManage(a);
    const v = validateGraph(input.graph);
    if (!v.ok) return { ok: false, error: v.issues.find((i) => i.level === "error")?.message ?? "הגרף אינו תקין." };
    const id = await createJourneyRepository(a.db).createWorkflow(a.orgId, a.userId, { ...input, status: input.activate ? "active" : "draft" });
    if (!id) return { ok: false, error: "יצירת המסע נכשלה." };
    revalidatePath("/journey-automation");
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function saveJourneyVersionAction(workflowId: string, graph: WorkflowGraph, notes?: string): Promise<Result<{ version: number }>> {
  try {
    const a = await getJourneyAccess(); assertManage(a);
    const v = validateGraph(graph);
    if (!v.ok) return { ok: false, error: v.issues.find((i) => i.level === "error")?.message ?? "הגרף אינו תקין." };
    const version = await createJourneyRepository(a.db).addVersion(a.orgId, a.userId, workflowId, graph, notes);
    revalidatePath("/journey-automation");
    return { ok: true, data: { version } };
  } catch (e) { return fail(e); }
}

export async function setJourneyStatusAction(workflowId: string, status: "active" | "paused" | "draft" | "archived", triggerType?: string | null): Promise<Result<{ ok: true }>> {
  try {
    const a = await getJourneyAccess(); assertManage(a);
    await createJourneyRepository(a.db).setWorkflowStatus(a.orgId, workflowId, status, triggerType);
    revalidatePath("/journey-automation");
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}

export async function simulateJourneyAction(graph: WorkflowGraph, event: TriggerEvent): Promise<Result<ExecutionResult>> {
  try { await getJourneyAccess(); return { ok: true, data: simulate(graph, event) }; } catch (e) { return fail(e); }
}

export async function dispatchManualAction(event: TriggerEvent, mode: "execution" | "simulation" = "execution"): Promise<Result<{ started: number }>> {
  try {
    const a = await getJourneyAccess(); assertManage(a);
    const r = await dispatchForOrg(a.db, a.orgId, a.userId, event, mode);
    revalidatePath("/journey-automation");
    return { ok: true, data: { started: r.started } };
  } catch (e) { return fail(e); }
}

export async function cancelExecutionAction(executionId: string): Promise<Result<{ ok: true }>> {
  try {
    const a = await getJourneyAccess(); assertManage(a);
    await createJourneyRepository(a.db).cancelExecution(a.orgId, executionId);
    revalidatePath("/journey-automation");
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}

export async function seedDefaultJourneysAction(): Promise<Result<{ created: number }>> {
  try {
    const a = await getJourneyAccess(); assertManage(a);
    const repo = createJourneyRepository(a.db);
    const existing = new Set((await repo.listWorkflows(a.orgId)).map((w) => w.name));
    let created = 0;
    for (const t of DEFAULT_JOURNEYS) {
      if (existing.has(t.name)) continue;
      const id = await repo.createWorkflow(a.orgId, a.userId, { name: t.name, description: t.description, journeyType: t.journeyType, triggerType: t.triggerType, graph: t.graph, status: "draft" });
      if (id) { await repo.registerTrigger(a.orgId, id, t.triggerType); created++; }
    }
    revalidatePath("/journey-automation");
    return { ok: true, data: { created } };
  } catch (e) { return fail(e); }
}

export async function runJourneyQueueAction(): Promise<Result<{ processed: number }>> {
  try {
    await getJourneyAccess();
    const r = await runJourneyDelayQueue();
    revalidatePath("/journey-automation");
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}
