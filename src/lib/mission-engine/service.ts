// ============================================================================
// 🚀 ZONO Universal Mission Engine™ — service / universal API (server-only). 27.5.
// createMission · createTasksFromMission · completeMission · cancelMission ·
// recalculateMission · linkMissionToEntity · listEntityMissions · getActionCenter
// · generateMissionsFromOfficeDecisions. Entity-agnostic; nothing auto-executes.
// Reuses the Decision Engine (read-only). No valuation / discovery changes.
// ============================================================================
import "server-only";
import { getOfficeDecisionPackage } from "@/lib/decision-engine";
import { generateTasks, defaultGoal, expectedRoi } from "./templates";
import { ACTIVE_STATUSES } from "./followup";
import { decisionToMissionInput } from "./decision-bridge";
import {
  insertMission, loadMission, listMissions, patchMission, MissionsTableMissing,
  type InsertMissionRow,
} from "./repository";
import {
  MISSION_ENGINE_VERSION,
  type Mission, type CreateMissionInput, type ActionCenter, type ExecStatus,
} from "./types";

export interface MissionResult { ok: boolean; mission?: Mission | null; error?: string; migrationRequired?: boolean }

/** Create a mission (+ auto-generated tasks). Nothing executes — default status
 *  is WAITING_FOR_APPROVAL unless the caller overrides. */
export async function createMission(input: CreateMissionInput): Promise<MissionResult> {
  try {
    const status = input.status ?? "WAITING_FOR_APPROVAL";
    const tasks = generateTasks(input.missionType, status === "READY" || status === "IN_PROGRESS" ? "READY" : "WAITING_FOR_APPROVAL");
    const nowIso = new Date().toISOString();
    const row: InsertMissionRow = {
      organization_id: input.organizationId ?? null, source_decision: input.sourceDecision ?? null,
      entity_type: input.entityType, entity_id: input.entityId ?? null, entity_name: input.entityName ?? null,
      mission_type: input.missionType, priority: input.priority ?? 50, business_impact: input.businessImpact ?? "medium",
      confidence: input.confidence ?? 50, reason: input.reason, goal: input.goal ?? defaultGoal(input.missionType),
      expected_outcome: input.expectedOutcome ?? expectedRoi(input.missionType), status, owner: input.owner ?? null,
      tasks, evidence: input.evidence ?? [], history: [{ at: nowIso, event: "created", detail: input.sourceDecision ?? null }],
      due_at: input.dueAt ?? null, created_by: input.createdBy ?? null,
    };
    const mission = await insertMission(row);
    if (!mission) return { ok: false, migrationRequired: true, error: "טבלת המשימות חסרה — יש להריץ מיגרציית 27.5." };
    return { ok: true, mission };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "יצירת משימה נכשלה." }; }
}

/** (Re)generate the task plan for a mission if empty. */
export async function createTasksFromMission(missionId: string): Promise<MissionResult> {
  const m = await loadMission(missionId);
  if (!m) return { ok: false, error: "המשימה לא נמצאה." };
  if (m.tasks.length > 0) return { ok: true, mission: m };
  const tasks = generateTasks(m.missionType);
  const updated = await patchMission(m, { tasks, appendHistory: { at: new Date().toISOString(), event: "tasks_generated", detail: `${tasks.length} משימות` } });
  return { ok: true, mission: updated };
}

/** Complete a mission (Part 8 — records the outcome; recalculate re-reads decisions). */
export async function completeMission(missionId: string, outcome?: string): Promise<MissionResult> {
  const m = await loadMission(missionId);
  if (!m) return { ok: false, error: "המשימה לא נמצאה." };
  const tasks = m.tasks.map((t) => (t.status === "DONE" || t.status === "CANCELLED" ? t : { ...t, status: "DONE" as ExecStatus }));
  const updated = await patchMission(m, { status: "DONE", markCompleted: true, tasks, appendHistory: { at: new Date().toISOString(), event: "completed", detail: outcome ?? null } });
  return { ok: true, mission: updated };
}

export async function cancelMission(missionId: string, reason?: string): Promise<MissionResult> {
  const m = await loadMission(missionId);
  if (!m) return { ok: false, error: "המשימה לא נמצאה." };
  const updated = await patchMission(m, { status: "CANCELLED", appendHistory: { at: new Date().toISOString(), event: "cancelled", detail: reason ?? null } });
  return { ok: true, mission: updated };
}

export async function updateMissionStatus(missionId: string, status: ExecStatus): Promise<MissionResult> {
  const m = await loadMission(missionId);
  if (!m) return { ok: false, error: "המשימה לא נמצאה." };
  if (status === "DONE") return completeMission(missionId);
  if (status === "CANCELLED") return cancelMission(missionId);
  const updated = await patchMission(m, { status, appendHistory: { at: new Date().toISOString(), event: "status", detail: status } });
  return { ok: true, mission: updated };
}

/** Re-read the source decisions (read-only) and refresh a mission's priority. */
export async function recalculateMission(missionId: string): Promise<MissionResult> {
  const m = await loadMission(missionId);
  if (!m) return { ok: false, error: "המשימה לא נמצאה." };
  if (m.entityType !== "office" || !m.entityId) return { ok: true, mission: m };
  const pkg = await getOfficeDecisionPackage(m.entityId).catch(() => null);
  if (!pkg) return { ok: true, mission: m };
  const match = pkg.decisions.find((d) => m.sourceDecision?.includes(d.title));
  const newPriority = match?.priorityScore ?? m.priority;
  const stillRelevant = !!match;
  const updated = await patchMission(m, { priority: newPriority, appendHistory: { at: new Date().toISOString(), event: "recalculated", detail: stillRelevant ? `עדיפות ${newPriority}` : "הראיה כבר לא בין ההחלטות המובילות — שקול סגירה" } });
  return { ok: true, mission: updated };
}

export async function linkMissionToEntity(missionId: string, entityType: string, entityId: string | null, entityName?: string | null): Promise<MissionResult> {
  const m = await loadMission(missionId);
  if (!m) return { ok: false, error: "המשימה לא נמצאה." };
  const updated = await patchMission(m, { entityType, entityId, entityName: entityName ?? null, appendHistory: { at: new Date().toISOString(), event: "linked", detail: `${entityType}:${entityId ?? ""}` } });
  return { ok: true, mission: updated };
}

export async function listEntityMissions(entityType: string, entityId: string, orgId?: string | null): Promise<Mission[]> {
  try { return await listMissions({ entityType, entityId, organizationId: orgId ?? null }); }
  catch { return []; }
}

/** Generate missions from an office's decision package (bridge). Dedupes against
 *  existing open missions for the same source decision. Nothing auto-executes. */
export async function generateMissionsFromOfficeDecisions(orgId: string | null, officeId: string, createdBy?: string | null): Promise<{ ok: boolean; created: Mission[]; migrationRequired?: boolean; note: string }> {
  const pkg = await getOfficeDecisionPackage(officeId).catch(() => null);
  if (!pkg) return { ok: false, created: [], note: "אין חבילת החלטות למשרד — הפעל שיוך/מודיעין תחילה." };
  const existing = await listEntityMissions("office", officeId, orgId);
  const existingKeys = new Set(existing.filter((m) => ACTIVE_STATUSES.includes(m.status)).map((m) => m.sourceDecision ?? ""));
  const created: Mission[] = [];
  for (const d of pkg.decisions) {
    const input = decisionToMissionInput(d, { organizationId: orgId, entityType: "office", entityId: officeId, entityName: pkg.subjectName, createdBy });
    if (existingKeys.has(input.sourceDecision ?? "")) continue;
    const r = await createMission(input);
    if (r.migrationRequired) return { ok: false, created, migrationRequired: true, note: "טבלת המשימות חסרה — יש להריץ מיגרציית 27.5." };
    if (r.ok && r.mission) created.push(r.mission);
  }
  return { ok: true, created, note: created.length ? `נוצרו ${created.length} משימות מהחלטות המשרד.` : "אין החלטות חדשות — כל המשימות כבר קיימות." };
}

/** The global Action Center (Part 6/10). */
export async function getActionCenter(orgId: string | null): Promise<ActionCenter> {
  let missions: Mission[] = [];
  const notes: string[] = [];
  try { missions = await listMissions({ organizationId: orgId, limit: 1000 }); }
  catch (e) { if (e instanceof MissionsTableMissing) notes.push("טבלת המשימות חסרה — יש להריץ מיגרציית 27.5 (zono_missions)."); }

  const active = missions.filter((m) => ACTIVE_STATUSES.includes(m.status));
  const today = new Date().toISOString().slice(0, 10);
  const isToday = (iso: string) => iso.slice(0, 10) === today;
  const byPr = (a: Mission, b: Mission) => b.priority - a.priority;

  const completed = missions.filter((m) => m.status === "DONE");
  const totalsCompleted = completed.length;
  const totalConsidered = active.length + totalsCompleted;
  const completionRatePct = totalConsidered ? Math.round((totalsCompleted / totalConsidered) * 100) : 0;
  const openWeight = active.reduce((s2, m) => s2 + m.priority, 0);
  const doneWeight = completed.reduce((s2, m) => s2 + m.priority, 0);
  const executionScore = openWeight + doneWeight ? Math.round((doneWeight / (openWeight + doneWeight)) * 100) : 0;

  const todaysTasks = active.flatMap((m) => m.tasks.filter((t) => t.status === "READY" || t.status === "IN_PROGRESS").slice(0, 3).map((task) => ({ missionId: m.id, missionTitle: m.goal || m.missionType, task })));

  return {
    organizationId: orgId,
    totals: {
      active: active.length, blocked: missions.filter((m) => m.status === "BLOCKED").length,
      waiting: missions.filter((m) => m.status === "WAITING_FOR_APPROVAL" || m.status === "WAITING_FOR_DATA").length,
      inProgress: missions.filter((m) => m.status === "IN_PROGRESS").length, completed: totalsCompleted,
      today: missions.filter((m) => isToday(m.createdAt)).length,
    },
    todaysMissions: [...active].filter((m) => isToday(m.createdAt) || m.priority >= 70).sort(byPr).slice(0, 10),
    critical: [...active].filter((m) => m.priority >= 80).sort(byPr).slice(0, 10),
    highPriority: [...active].filter((m) => m.priority >= 60 && m.priority < 80).sort(byPr).slice(0, 10),
    blocked: missions.filter((m) => m.status === "BLOCKED").sort(byPr).slice(0, 10),
    waiting: missions.filter((m) => m.status === "WAITING_FOR_APPROVAL" || m.status === "WAITING_FOR_DATA").sort(byPr).slice(0, 10),
    inProgress: missions.filter((m) => m.status === "IN_PROGRESS").sort(byPr).slice(0, 10),
    upcoming: active.filter((m) => m.dueAt).sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")).slice(0, 10),
    recentlyCreated: [...missions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    completed: [...completed].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 10),
    todaysTasks: todaysTasks.slice(0, 20),
    executionScore, completionRatePct, notes, version: MISSION_ENGINE_VERSION,
  };
}
