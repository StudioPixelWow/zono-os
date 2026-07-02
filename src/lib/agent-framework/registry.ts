// ============================================================================
// 🤖 Agent Framework — registry (pure, in-memory). 29.1. Part 4 + 8.
// Central registry: registerAgent / getAgent / listAgents / enableAgent /
// disableAgent / runAgent. Also holds the agent memory (organizational action
// log). State is per-process (no schema changes in 29.1); agents default to
// enabled. Instantiable for isolated testing; a default singleton hosts the app.
// ============================================================================
import { runAgentDefinition, type RunOptions } from "./runtime";
import { shouldRun, nextRunAt } from "./scheduler";
import { computePerformance, agentHealth } from "./performance";
import type {
  AgentDefinition, AgentContext, AgentRunResult, AgentView, AgentActionRecord,
  AgentEventKind, AgentStatus,
} from "./types";

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();
  private disabled = new Set<string>();
  private lastRun = new Map<string, string>();
  private log: AgentActionRecord[] = [];

  registerAgent(def: AgentDefinition): void { this.agents.set(def.id, def); }
  getAgent(id: string): AgentDefinition | null { return this.agents.get(id) ?? null; }
  listAgents(): AgentDefinition[] { return [...this.agents.values()]; }
  enableAgent(id: string): void { this.disabled.delete(id); }
  disableAgent(id: string): void { this.disabled.add(id); }
  isEnabled(id: string): boolean { return this.agents.has(id) && !this.disabled.has(id); }
  status(id: string): AgentStatus { return this.isEnabled(id) ? "enabled" : "disabled"; }
  lastRunAt(id: string): string | null { return this.lastRun.get(id) ?? null; }

  /** Eligibility (scheduler foundation) — no hard automation. */
  eligible(id: string, now: number, event?: string | null): boolean {
    const a = this.getAgent(id); if (!a || !this.isEnabled(id)) return false;
    return shouldRun(a.schedule, now, this.lastRunAt(id), event);
  }

  /** Run an agent (manual or triggered). Records recommendations; never executes. */
  runAgent(id: string, ctx: AgentContext): AgentRunResult {
    const a = this.getAgent(id);
    if (!a) return { agentId: id, agentName: id, ranAt: new Date(ctx.now).toISOString(), proposals: 0, inbox: [], blocked: 0, skipped: true, skipReason: "סוכן לא קיים" };
    const opts: RunOptions = { enabled: this.isEnabled(id), lastRunAt: this.lastRunAt(id) };
    const result = runAgentDefinition(a, ctx, opts);
    if (!result.skipped) {
      this.lastRun.set(id, result.ranAt);
      for (let i = 0; i < result.inbox.length; i++) this.record(id, "recommended");
    }
    return result;
  }

  // ── Part 8 — agent memory (organizational, not LLM) ─────────────────────────
  record(agentId: string, kind: AgentEventKind, at: string = new Date().toISOString()): void {
    this.log.push({ agentId, at, kind });
  }
  recordsFor(id: string): AgentActionRecord[] { return this.log.filter((r) => r.agentId === id); }

  /** A display view for one agent. */
  viewFor(id: string, now: number, pendingApprovals = 0): AgentView | null {
    const a = this.getAgent(id); if (!a) return null;
    const perf = computePerformance(this.recordsFor(id));
    const enabled = this.isEnabled(id);
    return {
      id: a.id, type: a.type, name: a.name, description: a.description, scope: a.scope,
      permissions: a.permissions, schedule: a.schedule, status: this.status(id),
      lastRunAt: this.lastRunAt(id), nextRunAt: nextRunAt(a.schedule, now, this.lastRunAt(id)),
      health: agentHealth(perf, pendingApprovals, enabled), confidence: enabled ? 60 : 0,
      performance: perf, pendingApprovals,
    };
  }
}

export const agentRegistry = new AgentRegistry();
