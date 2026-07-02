// ============================================================================
// 🤖 Agent Framework — service (server-only). 29.1.
// Loads the reused-engine context (Chief of Staff briefing + Mission Action
// Center) ONCE, runs every enabled agent through the runtime, and aggregates the
// inbox + performance + agent views for the dashboard. Read-only; nothing is
// auto-executed. No engine modified.
// ============================================================================
import "server-only";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getActionCenter } from "@/lib/mission-engine";
import { agentRegistry } from "./registry";
import "./agents"; // ensure built-ins are seeded
import type { AgentContext, AgentInboxItem, AgentView } from "./types";

export interface AgentsDashboard {
  version: string; generatedAt: string;
  totals: { agents: number; active: number; disabled: number; recommendations: number; needsApproval: number; blocked: number };
  agents: AgentView[];
  inbox: AgentInboxItem[];
  notes: string[];
}

export async function getAgentsDashboard(orgId: string | null): Promise<AgentsDashboard> {
  const notes: string[] = [];
  const now = Date.now();

  // Load reused-engine context once (read-only).
  const [cos, ac] = await Promise.all([
    getChiefOfStaff(orgId).catch(() => null),
    getActionCenter(orgId).catch(() => null),
  ]);
  if (!cos) notes.push("לא ניתן לטעון את ה-Chief of Staff — סוכן התדריך יפעל ללא נתונים.");
  if (!ac) notes.push("לא ניתן לטעון את מרכז הפעולות — סוכן המשימות יפעל ללא נתונים.");

  const ctx: AgentContext = {
    now, orgId,
    data: {
      briefing: cos ? { businessScore: cos.briefing.businessScore, executionScore: cos.briefing.executionScore, todaysPriorities: cos.briefing.todaysPriorities, criticalRisks: cos.briefing.criticalRisks } : undefined,
      actionCenter: ac ? { blocked: ac.blocked, waiting: ac.waiting, critical: ac.critical } : undefined,
    },
  };

  const inbox: AgentInboxItem[] = [];
  const pendingByAgent = new Map<string, number>();
  for (const def of agentRegistry.listAgents()) {
    const res = agentRegistry.runAgent(def.id, ctx);
    inbox.push(...res.inbox);
    pendingByAgent.set(def.id, res.inbox.filter((i) => i.requiresApproval && !i.blocked).length);
  }

  const agents = agentRegistry.listAgents()
    .map((def) => agentRegistry.viewFor(def.id, now, pendingByAgent.get(def.id) ?? 0))
    .filter((v): v is AgentView => !!v)
    .sort((a, b) => b.pendingApprovals - a.pendingApprovals);

  inbox.sort((a, b) => b.urgency - a.urgency);
  const needsApproval = inbox.filter((i) => i.requiresApproval && !i.blocked).length;
  const blocked = inbox.filter((i) => i.blocked).length;

  return {
    version: "29.1", generatedAt: new Date(now).toISOString(),
    totals: {
      agents: agents.length,
      active: agents.filter((a) => a.status === "enabled").length,
      disabled: agents.filter((a) => a.status === "disabled").length,
      recommendations: inbox.length, needsApproval, blocked,
    },
    agents, inbox: inbox.slice(0, 30), notes,
  };
}

/** Enable/disable an agent (per-process state; no schema changes in 29.1). */
export function setAgentEnabled(agentId: string, enabled: boolean): void {
  if (enabled) agentRegistry.enableAgent(agentId); else agentRegistry.disableAgent(agentId);
}
