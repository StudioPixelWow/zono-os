// ============================================================================
// 🤖 ZONO Autonomous AI Agent Framework™ — public surface. 29.1.
// The universal framework every future agent reuses: Base Agent, registry,
// runtime, permissions, inbox, scheduler foundation, memory, explainability and
// performance. Nothing auto-executes (AUTO_EXECUTE off by default). Reuses the
// existing engines read-only; no protected engine modified. Two safe placeholder
// agents (Daily Briefing, Mission Follow-up) are seeded on import.
// ============================================================================
import "./agents"; // side-effect: seed the built-in placeholder agents

export { AgentRegistry, agentRegistry } from "./registry";
export { runAgentDefinition, type RunOptions } from "./runtime";
export { buildInboxItem } from "./inbox";
export { computePerformance, agentHealth, emptyPerformance } from "./performance";
export { shouldRun, nextRunAt, triggerEventFor } from "./scheduler";
export { has, canPropose, requiresApproval, canAutoExecute, DEFAULT_PERMISSIONS } from "./permissions";
export { BUILTIN_AGENTS, seedBuiltinAgents, dailyBriefingAgent, missionFollowupAgent } from "./agents";
export { getAgentsDashboard, setAgentEnabled, type AgentsDashboard } from "./service";
export { runSelfCheck, type AFSelfCheck, type AFCheck } from "./qa";
export { AGENT_FRAMEWORK_VERSION } from "./types";
export type {
  AgentType, AgentPermission, AgentStatus, ProposalKind, Impact, ScheduleMode, AgentSchedule,
  AgentContext, AgentProposal, AgentInboxItem, AgentDefinition, AgentActionRecord, AgentEventKind,
  AgentPerformance, AgentRunResult, AgentView,
} from "./types";
