// ============================================================================
// 🤖 Agent Framework — built-in placeholder agents + registry seed. 29.1. Part 12.
// ============================================================================
import { agentRegistry, type AgentRegistry } from "../registry";
import { dailyBriefingAgent } from "./daily-briefing";
import { missionFollowupAgent } from "./mission-followup";

export const BUILTIN_AGENTS = [dailyBriefingAgent, missionFollowupAgent];

export function seedBuiltinAgents(reg: AgentRegistry = agentRegistry): void {
  for (const a of BUILTIN_AGENTS) if (!reg.getAgent(a.id)) reg.registerAgent(a);
}

// Seed the default singleton on import.
seedBuiltinAgents();

export { dailyBriefingAgent, missionFollowupAgent };
