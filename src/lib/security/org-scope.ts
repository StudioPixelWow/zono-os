// ============================================================================
// 🔐 ZONO Wave 0 — organization-scoped write boundary (PURE decision + wrapper).
// Confirmed risk: all writes run via the service-role client (BYPASSRLS) relying
// on hand-written org_id filters; a single omission = cross-tenant write. This
// centralizes the authorization DECISION so no server action re-implements it and
// no service-role write can accept an arbitrary org id from an untrusted client.
//
// The pure `authorizeWrite` is fully testable; the DB-integrated wrapper
// (loadActor + scoped insert/update) is built on top and documented in
// docs/security/ZONO_RLS_AND_SERVICE_ROLE_AUDIT.md.
// ============================================================================

export type Role = "owner" | "manager" | "agent" | "assistant";
export type MembershipStatus = "active" | "disabled" | "removed";
export type WriteAction = "create" | "update" | "delete" | "archive";

export interface ActorContext {
  userId: string;
  organizationId: string;      // derived from the authenticated session, never from the client
  role: Role;
  status: MembershipStatus;
}

export interface WriteTarget {
  /** Org the record belongs to (existing record) or is being created in. */
  targetOrganizationId: string;
  action: WriteAction;
  /** Owner of the target record, when updating/deleting an owned record. */
  ownerUserId?: string | null;
  /** Actions that require manager+ (e.g. reassignment, role change, deactivation). */
  requiresManager?: boolean;
}

export interface AuthDecision {
  allow: boolean;
  reason: string;
}

const RANK: Record<Role, number> = { owner: 4, manager: 3, agent: 2, assistant: 1 };

/**
 * Decide whether an actor may perform a write. Deny-by-default; every deny has a
 * stable reason for observability. Cross-tenant is ALWAYS denied.
 */
export function authorizeWrite(actor: ActorContext, target: WriteTarget): AuthDecision {
  // 1. Inactive membership can never mutate (Wave 0 deactivation enforcement).
  if (actor.status !== "active") return { allow: false, reason: "inactive_member" };

  // 2. Hard tenant boundary — actor org must equal target org.
  if (actor.organizationId !== target.targetOrganizationId) return { allow: false, reason: "cross_tenant_denied" };

  // 3. Manager-gated actions.
  if (target.requiresManager && RANK[actor.role] < RANK.manager) return { allow: false, reason: "requires_manager" };

  // 4. Owner/manager may act on any record in-org; agents/assistants may act on
  //    their own owned records (or unowned/new ones). Cross-owner edits by an
  //    agent require manager+.
  if (RANK[actor.role] >= RANK.manager) return { allow: true, reason: "manager_or_owner" };
  if (target.ownerUserId == null || target.ownerUserId === actor.userId) return { allow: true, reason: "own_or_unowned_record" };
  return { allow: false, reason: "not_record_owner" };
}

/**
 * Guard used by the write wrapper: throws a stable error the API layer maps to
 * 403 without leaking detail. (The DB wrapper injects target.targetOrganizationId
 * = actor.organizationId for creates, so a create can never target another org.)
 */
export class OrgScopeError extends Error {
  constructor(public reason: string) { super(`org_scope_denied:${reason}`); this.name = "OrgScopeError"; }
}

export function assertWrite(actor: ActorContext, target: WriteTarget): void {
  const d = authorizeWrite(actor, target);
  if (!d.allow) throw new OrgScopeError(d.reason);
}
