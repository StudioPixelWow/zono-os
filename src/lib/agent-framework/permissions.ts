// ============================================================================
// 🤖 Agent Framework — permissions (pure). 29.1. Part 5.
// Every agent declares what it MAY do. AUTO_EXECUTE is never granted by default;
// the framework never executes a proposal regardless of permissions in 29.1.
// ============================================================================
import type { AgentPermission, ProposalKind } from "./types";

export const DEFAULT_PERMISSIONS: AgentPermission[] = ["READ", "SUGGEST", "REQUEST_APPROVAL"];

const KIND_REQUIRES: Record<ProposalKind, AgentPermission> = {
  recommendation: "SUGGEST", mission: "CREATE_MISSION", task: "CREATE_TASK", draft: "CREATE_DRAFT",
};

export function has(permissions: AgentPermission[], p: AgentPermission): boolean {
  return permissions.includes(p);
}

/** Whether an agent is permitted to PRODUCE a proposal of this kind. */
export function canPropose(permissions: AgentPermission[], kind: ProposalKind): boolean {
  return has(permissions, KIND_REQUIRES[kind]);
}

/** Approval is always required unless the agent explicitly holds AUTO_EXECUTE. */
export function requiresApproval(permissions: AgentPermission[]): boolean {
  return !has(permissions, "AUTO_EXECUTE");
}

/** The framework NEVER auto-executes in 29.1 — this is always false. */
export function canAutoExecute(): boolean {
  return false;
}
