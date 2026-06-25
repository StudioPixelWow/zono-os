// ============================================================================
// ZONO — Per-agent productivity (pure, deterministic). Derived from agent
// metrics already produced by Office Intelligence + automation usage.
// ============================================================================
import { clamp, round } from "./analytics";
import type { AgentProductivity } from "./types";

export interface AgentProductivityInput {
  agentId: string;
  name: string;
  calls: number;
  whatsapps: number;
  meetings: number;
  tasksCompleted: number;
  exclusivesSigned: number;
  /** automation steps attributed to this agent's entities (if known). */
  automationSteps: number;
  /** AI generations attributed (briefs/whatsapps). */
  aiGenerations: number;
  totalActions: number;          // denominator for usage %
}

const MIN_SAVED = { call: 4, whatsapp: 5, meeting: 10, task: 3, automation: 6, ai: 12 };

export function computeAgentProductivity(i: AgentProductivityInput): AgentProductivity {
  const minutes =
    i.calls * MIN_SAVED.call + i.whatsapps * MIN_SAVED.whatsapp + i.meetings * MIN_SAVED.meeting +
    i.tasksCompleted * MIN_SAVED.task + i.automationSteps * MIN_SAVED.automation + i.aiGenerations * MIN_SAVED.ai;
  const denom = Math.max(1, i.totalActions);
  return {
    agentId: i.agentId, name: i.name,
    hoursSaved: round(minutes / 60, 1),
    tasksAutomated: i.automationSteps,
    meetingsCreated: i.meetings,
    callsMade: i.calls,
    dealsAccelerated: i.exclusivesSigned,
    automationUsagePct: round(clamp((i.automationSteps / denom) * 100, 0, 100), 0),
    aiUsagePct: round(clamp((i.aiGenerations / denom) * 100, 0, 100), 0),
  };
}
