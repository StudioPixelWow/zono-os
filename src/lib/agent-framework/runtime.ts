// ============================================================================
// 🤖 Agent Framework — runtime (pure). 29.1. Part 3.
// Executes ONE agent: observe (context injected) → reason (agent.run) → gate by
// permissions → produce inbox items awaiting approval. NOTHING is auto-executed.
// The runtime never calls an engine directly — context is loaded upstream.
// ============================================================================
import { buildInboxItem } from "./inbox";
import type { AgentDefinition, AgentContext, AgentRunResult } from "./types";

export interface RunOptions { enabled?: boolean; lastRunAt?: string | null }

/** Run an agent definition against an injected context. Returns gated inbox items. */
export function runAgentDefinition(agent: AgentDefinition, ctx: AgentContext, opts: RunOptions = {}): AgentRunResult {
  const ranAt = new Date(ctx.now).toISOString();
  if (opts.enabled === false) {
    return { agentId: agent.id, agentName: agent.name, ranAt, proposals: 0, inbox: [], blocked: 0, skipped: true, skipReason: "הסוכן מושבת" };
  }
  let proposals: ReturnType<AgentDefinition["run"]> = [];
  try { proposals = agent.run(ctx) ?? []; }
  catch { return { agentId: agent.id, agentName: agent.name, ranAt, proposals: 0, inbox: [], blocked: 0, skipped: true, skipReason: "שגיאת ריצה" }; }

  const inbox = proposals.map((p, i) => buildInboxItem(agent, p, i + 1));
  const blocked = inbox.filter((x) => x.blocked).length;
  return { agentId: agent.id, agentName: agent.name, ranAt, proposals: proposals.length, inbox, blocked, skipped: false, skipReason: null };
}
