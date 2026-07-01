// ============================================================================
// 🗄️ Mission Engine — persistence (server-only). Phase 27.5.
// Persists missions to zono_missions (service-role writes). Degrades gracefully
// if the migration hasn't been applied (returns a clear signal). Never throws.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { suggestFollowUps, buildExplain } from "./followup";
import type { Mission, MissionTask, MissionHistoryEntry, ExecStatus, Impact } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const TABLE = "zono_missions";
const isMissing = (m: string) => /does not exist|relation .* does not exist|schema cache|could not find the table/i.test(m);
export class MissionsTableMissing extends Error { constructor() { super("zono_missions table missing — run the 27.5 migration."); } }

export function rowToMission(r: Row): Mission {
  const missionType = s(r.mission_type) || "GENERAL";
  const businessImpact = (s(r.business_impact) || "medium") as Impact;
  const priority = n(r.priority);
  const status = (s(r.status) || "WAITING_FOR_APPROVAL") as ExecStatus;
  const tasks = arr<MissionTask>(r.tasks);
  const evidence = arr<string>(r.evidence);
  const goal = s(r.goal), reason = s(r.reason);
  const m: Mission = {
    id: s(r.id), organizationId: s(r.organization_id) || null, sourceDecision: s(r.source_decision) || null,
    entityType: s(r.entity_type), entityId: s(r.entity_id) || null, entityName: s(r.entity_name) || null,
    missionType, priority, businessImpact, confidence: n(r.confidence), reason,
    goal, expectedOutcome: s(r.expected_outcome),
    status, owner: s(r.owner) || null, tasks, history: arr<MissionHistoryEntry>(r.history), evidence,
    createdAt: s(r.created_at) || new Date().toISOString(), updatedAt: s(r.updated_at) || new Date().toISOString(),
    dueAt: s(r.due_at) || null, completedAt: s(r.completed_at) || null, createdBy: s(r.created_by) || null,
    explain: buildExplain({ why: reason || goal, fromDecision: s(r.source_decision) || null, businessImpact, confidence: n(r.confidence), priority, missionType }),
    followUps: [],
  };
  m.followUps = suggestFollowUps(m);
  return m;
}

export interface InsertMissionRow {
  organization_id: string | null; source_decision: string | null;
  entity_type: string; entity_id: string | null; entity_name: string | null;
  mission_type: string; priority: number; business_impact: string; confidence: number;
  reason: string; goal: string; expected_outcome: string; status: string; owner: string | null;
  tasks: MissionTask[]; evidence: string[]; history: MissionHistoryEntry[]; due_at: string | null; created_by: string | null;
}

export async function insertMission(row: InsertMissionRow): Promise<Mission | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from(TABLE as never).insert(row as never).select("*").maybeSingle();
  if (error) { if (isMissing(error.message)) return null; throw new Error(error.message); }
  return data ? rowToMission(data as Row) : null;
}

export async function loadMission(id: string): Promise<Mission | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from(TABLE as never).select("*").eq("id", id).maybeSingle();
  if (error) { if (isMissing(error.message)) return null; throw new Error(error.message); }
  return data ? rowToMission(data as Row) : null;
}

export async function listMissions(filter: { organizationId?: string | null; entityType?: string; entityId?: string | null; limit?: number }): Promise<Mission[]> {
  const db = createServiceRoleClient();
  let q = db.from(TABLE as never).select("*").order("updated_at", { ascending: false }).limit(filter.limit ?? 500);
  if (filter.entityType) q = q.eq("entity_type", filter.entityType);
  if (filter.entityId) q = q.eq("entity_id", filter.entityId);
  const { data, error } = await q;
  if (error) { if (isMissing(error.message)) throw new MissionsTableMissing(); throw new Error(error.message); }
  const rows = ((data ?? []) as Row[]).filter((r) => !filter.organizationId || !s(r.organization_id) || s(r.organization_id) === filter.organizationId);
  return rows.map(rowToMission);
}

export interface MissionPatch { status?: ExecStatus; priority?: number; owner?: string | null; tasks?: MissionTask[]; appendHistory?: MissionHistoryEntry; markCompleted?: boolean; dueAt?: string | null; entityType?: string; entityId?: string | null; entityName?: string | null }

export async function patchMission(m: Mission, patch: MissionPatch): Promise<Mission> {
  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const upd: Row = { updated_at: nowIso };
  if (patch.status) upd.status = patch.status;
  if (patch.priority != null) upd.priority = patch.priority;
  if (patch.owner !== undefined) upd.owner = patch.owner;
  if (patch.tasks) upd.tasks = patch.tasks as never;
  if (patch.dueAt !== undefined) upd.due_at = patch.dueAt;
  if (patch.entityType) upd.entity_type = patch.entityType;
  if (patch.entityId !== undefined) upd.entity_id = patch.entityId;
  if (patch.entityName !== undefined) upd.entity_name = patch.entityName;
  if (patch.appendHistory) upd.history = [...m.history, patch.appendHistory].slice(-100) as never;
  if (patch.markCompleted) upd.completed_at = nowIso;
  const { data, error } = await db.from(TABLE as never).update(upd as never).eq("id", m.id).select("*").maybeSingle();
  if (error) { if (isMissing(error.message)) throw new MissionsTableMissing(); throw new Error(error.message); }
  return data ? rowToMission(data as Row) : { ...m, ...patch, updatedAt: nowIso };
}
