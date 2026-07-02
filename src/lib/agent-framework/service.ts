// ============================================================================
// 🤖 Agent Framework — service (server-only). 29.2 (persistent).
// Loads the reused-engine context, runs enabled agents through the runtime,
// PERSISTS runs + inbox + memory + performance, and serves the persisted inbox
// (survives refresh/deploy). Approvals create missions only when permitted;
// nothing auto-executes. Reuses Chief of Staff + Mission Engine read-only.
// ============================================================================
import "server-only";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getActionCenter, createMission } from "@/lib/mission-engine";
import { agentRegistry } from "./registry";
import { runAgentDefinition } from "./runtime";
import { shouldRun, nextRunAt } from "./scheduler";
import { performanceFromInbox, agentHealth } from "./performance";
import { approvalCreates } from "./permissions";
import * as store from "./persistence";
import "./agents"; // seed built-ins
import type { AgentContext, AgentInboxItem, AgentView, AgentDefinition } from "./types";

export interface AgentsDashboard {
  version: string; generatedAt: string; migrationRequired: boolean;
  totals: { agents: number; active: number; disabled: number; recommendations: number; needsApproval: number; blocked: number };
  agents: (AgentView & { performanceHistory: { capturedAt: string; recommendations: number; approved: number; rejected: number; successRate: number }[] })[];
  inbox: AgentInboxItem[];
  runs: { agentId: string; ranAt: string; proposals: number; blocked: number; skipped: boolean; trigger: string }[];
  notes: string[];
}

async function loadContext(orgId: string | null): Promise<{ ctx: AgentContext; notes: string[] }> {
  const notes: string[] = [];
  const [cos, ac] = await Promise.all([getChiefOfStaff(orgId).catch(() => null), getActionCenter(orgId).catch(() => null)]);
  if (!cos) notes.push("לא ניתן לטעון את ה-Chief of Staff.");
  if (!ac) notes.push("לא ניתן לטעון את מרכז הפעולות.");
  return {
    notes,
    ctx: {
      now: Date.now(), orgId,
      data: {
        briefing: cos ? { businessScore: cos.briefing.businessScore, executionScore: cos.briefing.executionScore, todaysPriorities: cos.briefing.todaysPriorities, criticalRisks: cos.briefing.criticalRisks } : undefined,
        actionCenter: ac ? { blocked: ac.blocked, waiting: ac.waiting, critical: ac.critical } : undefined,
      },
    },
  };
}

/** Run enabled agents + persist (manual dashboard build or scheduled). */
async function runAndPersist(orgId: string, ctx: AgentContext, trigger: string, opts: { scheduledOnly?: boolean } = {}): Promise<void> {
  const defs = agentRegistry.listAgents();
  const [enabledMap, timings] = await Promise.all([store.getEnabledMap(orgId), store.getTimings(orgId)]);
  for (const def of defs) {
    const enabled = enabledMap.get(def.id) ?? true;
    if (opts.scheduledOnly && !(enabled && shouldRun(def.schedule, ctx.now, timings.get(def.id)?.lastRunAt ?? null, trigger === "manual" ? "manual" : trigger))) continue;
    const res = runAgentDefinition(def, ctx, { enabled });
    await store.insertRun(orgId, res, trigger);
    if (!res.skipped) {
      await store.upsertInboxItems(orgId, res.inbox);
      await store.setTimings(orgId, def.id, res.ranAt, nextRunAt(def.schedule, ctx.now, res.ranAt));
    }
  }
}

export async function getAgentsDashboard(orgId: string | null): Promise<AgentsDashboard> {
  const now = Date.now();
  if (!orgId) return emptyDashboard(now, ["יש להתחבר."]);
  const defs = agentRegistry.listAgents();
  await store.ensureAgentsSeeded(orgId, defs);

  const { ctx, notes } = await loadContext(orgId);
  await runAndPersist(orgId, ctx, "manual");

  const [enabledMap, timings, inbox, runs] = await Promise.all([
    store.getEnabledMap(orgId), store.getTimings(orgId),
    store.listInbox(orgId, { limit: 50 }), store.listRuns(orgId, 20),
  ]);
  const migrationRequired = inbox.length === 0 && runs.length === 0 && enabledMap.size === 0;
  if (migrationRequired) notes.push("טבלאות הסוכנים חסרות — יש להריץ מיגרציית 29.2 (zono_agents).");

  const agents = await Promise.all(defs.map(async (def) => {
    const items = inbox.filter((i) => i.agentId === def.id);
    const perf = performanceFromInbox(items);
    await store.snapshotPerformance(orgId, def.id, perf);
    const enabled = enabledMap.get(def.id) ?? true;
    const pending = items.filter((i) => i.status === "pending" && i.requiresApproval && !i.blocked).length;
    const t = timings.get(def.id);
    return {
      id: def.id, type: def.type, name: def.name, description: def.description, scope: def.scope,
      permissions: def.permissions, schedule: def.schedule, status: (enabled ? "enabled" : "disabled") as AgentView["status"],
      lastRunAt: t?.lastRunAt ?? null, nextRunAt: t?.nextRunAt ?? null,
      health: agentHealth(perf, pending, enabled), confidence: enabled ? 60 : 0, performance: perf, pendingApprovals: pending,
      performanceHistory: await store.performanceHistory(orgId, def.id, 14),
    };
  }));

  const needsApproval = inbox.filter((i) => i.status === "pending" && i.requiresApproval && !i.blocked).length;
  const blocked = inbox.filter((i) => i.blocked).length;
  return {
    version: "29.2", generatedAt: new Date(now).toISOString(), migrationRequired,
    totals: { agents: agents.length, active: agents.filter((a) => a.status === "enabled").length, disabled: agents.filter((a) => a.status === "disabled").length, recommendations: inbox.length, needsApproval, blocked },
    agents: agents.sort((a, b) => b.pendingApprovals - a.pendingApprovals), inbox, runs, notes,
  };
}

function emptyDashboard(now: number, notes: string[]): AgentsDashboard {
  return { version: "29.2", generatedAt: new Date(now).toISOString(), migrationRequired: false, totals: { agents: 0, active: 0, disabled: 0, recommendations: 0, needsApproval: 0, blocked: 0 }, agents: [], inbox: [], runs: [], notes };
}

/** Enable/disable an agent — persisted (survives deploys). */
export async function setAgentEnabled(orgId: string | null, agentId: string, enabled: boolean): Promise<boolean> {
  if (!orgId) return false;
  const def = agentRegistry.getAgent(agentId);
  return store.setEnabled(orgId, agentId, enabled, def ? { type: def.type, name: def.name, scheduleMode: def.schedule.mode } : undefined);
}

/** Part 3 — approve an inbox item. Creates a mission only if permitted; never auto-executes. */
export async function approveInboxItem(orgId: string | null, itemId: string, createdBy?: string | null): Promise<{ ok: boolean; createdMissionId?: string | null; note: string }> {
  if (!orgId) return { ok: false, note: "יש להתחבר." };
  const item = await store.getInboxItem(orgId, itemId);
  if (!item) return { ok: false, note: "הפריט לא נמצא." };
  if (item.status !== "pending") return { ok: false, note: `הפריט כבר ${item.status}.` };
  const def: AgentDefinition | null = agentRegistry.getAgent(item.agentId);
  const creates = def ? approvalCreates(item, def.permissions) : null;

  let createdMissionId: string | null = null;
  if (creates === "mission") {
    const r = await createMission({
      organizationId: orgId, entityType: item.entityType ?? "organization", entityId: item.entityId ?? null, entityName: item.entityName ?? null,
      missionType: item.missionType ?? "GENERAL", reason: item.reason || item.recommendation, evidence: item.evidence,
      businessImpact: item.impact, confidence: item.confidence, sourceDecision: `agent:${item.agentId}`, createdBy: createdBy ?? null,
      // status defaults to WAITING_FOR_APPROVAL — the mission itself still awaits execution approval.
    });
    if (r.ok && r.mission) createdMissionId = r.mission.id;
  }
  await store.decideInbox(orgId, itemId, "approved", null, createdMissionId);
  await store.recordMemory(orgId, item.agentId, "approved", createdMissionId ? `mission:${createdMissionId}` : item.recommendation);
  return { ok: true, createdMissionId, note: createdMissionId ? "אושר — נוצרה משימה הממתינה לביצוע (לא בוצע אוטומטית)." : "אושר." };
}

export async function rejectInboxItem(orgId: string | null, itemId: string, reason: string): Promise<{ ok: boolean; note: string }> {
  if (!orgId) return { ok: false, note: "יש להתחבר." };
  const item = await store.getInboxItem(orgId, itemId);
  if (!item) return { ok: false, note: "הפריט לא נמצא." };
  await store.decideInbox(orgId, itemId, "rejected", reason || "נדחה", null);
  await store.recordMemory(orgId, item.agentId, "rejected", reason || "נדחה");
  return { ok: true, note: "נדחה ותועד." };
}

/** Part 4 — safe scheduled runner (called by the CRON route). Never executes. */
export async function runScheduledAgents(orgId: string, trigger = "cron"): Promise<{ ok: boolean; ran: number }> {
  await store.ensureAgentsSeeded(orgId, agentRegistry.listAgents());
  const { ctx } = await loadContext(orgId);
  const before = (await store.listRuns(orgId, 1))[0]?.ranAt ?? null;
  await runAndPersist(orgId, ctx, trigger, { scheduledOnly: true });
  const after = await store.listRuns(orgId, 10);
  return { ok: true, ran: after.filter((r) => !before || r.ranAt > before).length };
}
