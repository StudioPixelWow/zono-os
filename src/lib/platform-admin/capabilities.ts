// ============================================================================
// ZONO — PLATFORM ADMIN capability registry (PURE, client-safe, deterministic).
// ----------------------------------------------------------------------------
// P5.0 Security & Trust Foundation. This is the ONE authoritative mapping of
// platform roles → platform capabilities. It is COMPLETELY DISJOINT from the
// organization role/permission model (src/lib/permissions/*). A platform
// operator is ZONO staff; an org owner/admin is NOT a platform operator and
// gains ZERO platform access from their org role.
//
// This module is PURE (no DB, no server-only, no secrets) so it can be unit
// tested offline via scripts/platform-admin-dev-check.ts. All authorization
// DECISIONS flow through `operatorCan()` here; the server guard only resolves
// the operator from the DB and delegates the decision to this pure function.
// ============================================================================

/** Platform (ZONO-staff) roles. NOT organization roles. */
export const PLATFORM_ROLES = ["super_admin", "operations", "support", "billing_admin", "developer"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Operator account status. */
export const PLATFORM_OPERATOR_STATUSES = ["active", "suspended"] as const;
export type PlatformOperatorStatus = (typeof PLATFORM_OPERATOR_STATUSES)[number];

/** The full, closed set of platform capabilities. Namespaced `platform.*` so
 *  they can never collide with organization capability strings. */
export const PLATFORM_CAPABILITIES = [
  "platform.customers.read",
  "platform.customers.manage",
  "platform.users.read",
  "platform.users.manage",
  "platform.billing.read",
  "platform.billing.manage",
  "platform.flags.read",
  "platform.flags.manage",
  "platform.entitlements.read",
  "platform.entitlements.manage",
  "platform.usage.read",
  "platform.ai.read",
  "platform.integrations.read",
  "platform.integrations.manage",
  "platform.ops.read",
  "platform.ops.replay",
  "platform.support.read",
  "platform.support.manage",
  "platform.support.impersonate",
  "platform.audit.read",
  "platform.admins.read",
  "platform.admins.manage",
] as const;
export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

/** Minimal, resolved operator identity (never carries secrets). */
export interface PlatformOperator {
  userId: string;
  role: PlatformRole;
  status: PlatformOperatorStatus;
}

// ── Role → capability matrix (authoritative) ────────────────────────────────
// super_admin holds every capability; all other roles are least-privilege.
const READ_ONLY_CUSTOMER_BASE: PlatformCapability[] = ["platform.customers.read", "platform.users.read", "platform.audit.read"];

const ROLE_CAPABILITIES: Record<PlatformRole, ReadonlySet<PlatformCapability>> = {
  super_admin: new Set(PLATFORM_CAPABILITIES),
  operations: new Set<PlatformCapability>([
    ...READ_ONLY_CUSTOMER_BASE,
    "platform.integrations.read", "platform.integrations.manage",
    "platform.ops.read", "platform.ops.replay",
    "platform.usage.read", "platform.ai.read",
  ]),
  support: new Set<PlatformCapability>([
    ...READ_ONLY_CUSTOMER_BASE,
    "platform.support.read", "platform.support.manage", "platform.support.impersonate",
    "platform.integrations.read", "platform.usage.read",
  ]),
  billing_admin: new Set<PlatformCapability>([
    ...READ_ONLY_CUSTOMER_BASE,
    "platform.billing.read", "platform.billing.manage",
    "platform.entitlements.read",
  ]),
  developer: new Set<PlatformCapability>([
    ...READ_ONLY_CUSTOMER_BASE,
    "platform.flags.read", "platform.flags.manage",
    "platform.entitlements.read", "platform.entitlements.manage",
    "platform.usage.read", "platform.ai.read",
    "platform.integrations.read", "platform.ops.read",
  ]),
};

/** Does this platform role hold this capability? (pure) */
export function roleHasCapability(role: PlatformRole, capability: PlatformCapability): boolean {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

/** The full capability set for a role (for UI/debug; never secrets). */
export function capabilitiesForRole(role: PlatformRole): PlatformCapability[] {
  return PLATFORM_CAPABILITIES.filter((c) => roleHasCapability(role, c));
}

/**
 * THE authoritative authorization decision. FAIL-CLOSED:
 *  · null operator (not a platform operator) → false
 *  · status !== "active" (suspended) → false
 *  · unknown role → false
 *  · else → role-capability matrix.
 * Note: this function NEVER reads an organization role and NEVER trusts any
 * client-supplied role/capability/orgId — it decides purely from a resolved,
 * server-verified operator identity.
 */
export function operatorCan(operator: PlatformOperator | null | undefined, capability: PlatformCapability): boolean {
  if (!operator) return false;
  if (operator.status !== "active") return false;
  if (!PLATFORM_ROLES.includes(operator.role)) return false;
  return roleHasCapability(operator.role, capability);
}

export function isPlatformRole(v: unknown): v is PlatformRole {
  return typeof v === "string" && (PLATFORM_ROLES as readonly string[]).includes(v);
}
export function isPlatformCapability(v: unknown): v is PlatformCapability {
  return typeof v === "string" && (PLATFORM_CAPABILITIES as readonly string[]).includes(v);
}
