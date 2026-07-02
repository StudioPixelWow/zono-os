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

/**
 * Part 3 — on approval, whether the item may CREATE a mission/task. Only when the
 * item is a mission/task kind, is not blocked, and the agent holds the matching
 * permission. Approving never auto-executes: a created mission itself awaits
 * execution approval (default WAITING_FOR_APPROVAL).
 */
export function approvalCreates(item: { kind: ProposalKind; blocked: boolean }, permissions: AgentPermission[]): "mission" | "task" | null {
  if (item.blocked) return null;
  if (item.kind === "mission" && has(permissions, "CREATE_MISSION")) return "mission";
  if (item.kind === "task" && has(permissions, "CREATE_TASK")) return "task";
  return null;
}
