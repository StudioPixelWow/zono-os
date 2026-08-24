// ============================================================================
// ZONO 9.2 — TEAM TRUTH · PURE decision rules (no I/O, offline-testable). The
// single source of the membership↔access truth logic, imported by the server-only
// sync module AND the public-site filter, and unit-tested behaviorally. Nothing
// here reads a DB, a session, or a provider.
// ============================================================================

/** Role rank ordering — mirrors the RLS role_rank (owner>admin>manager>…). */
export const ROLE_RANK: Record<string, number> = {
  owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20,
};

export function roleRank(key: string | null | undefined): number {
  return ROLE_RANK[(key ?? "").toLowerCase()] ?? 0;
}

/** Access role key → roster role text (cosmetic; the board only special-cases owner). */
export function rosterRole(roleKey: string | null | undefined): string {
  const k = (roleKey ?? "").toLowerCase();
  return k === "owner" ? "owner" : k === "manager" ? "manager" : "agent";
}

/**
 * §11 ROLE INTEGRITY — a caller may assign ONLY a role at or below their own rank.
 * A manager can never mint an owner/admin; a non-owner admin can never mint an owner.
 * An unknown/empty target role is never assignable.
 */
export function canAssignRole(callerRoleKey: string | null | undefined, targetRoleKey: string | null | undefined): boolean {
  const target = roleRank(targetRoleKey);
  if (target === 0) return false;
  return target <= roleRank(callerRoleKey);
}

/** Access status → roster status: suspend hides (inactive), reactivate restores (active). */
export function memberStatusForAccess(active: boolean): "active" | "inactive" {
  return active ? "active" : "inactive";
}

/**
 * §7 PUBLIC ROSTER eligibility. A roster member is publicly shown iff it is active,
 * opted into the website, AND — when linked to an access user — that user is active.
 * Orphan (login-less) roster members are first-class and always eligible when active
 * + opted-in. `linkedUserStatus = null` means no linked access user (orphan).
 */
export function isMemberPubliclyEligible(m: { memberStatus: string; showOnWebsite: boolean; linkedUserStatus: string | null }): boolean {
  if (m.memberStatus !== "active") return false;
  if (!m.showOnWebsite) return false;
  if (m.linkedUserStatus === null) return true;
  return m.linkedUserStatus === "active";
}
