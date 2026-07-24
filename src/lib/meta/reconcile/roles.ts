// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION ROLE GATES (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Pure role predicates for the reconciliation surface, extracted so both the
// server service and the offline QA share one source of truth. A support operator
// can VIEW safe diagnostics but can NEVER silently resolve a discrepancy or mark
// provider success — resolution requires an explicit privileged actor + audit.
// ============================================================================
const VERIFIER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);
const RESOLVER_ROLES = new Set(["owner", "admin", "org_admin", "manager"]);

/** May request verification / view discrepancies. */
export const canRequestVerification = (role: string): boolean => VERIFIER_ROLES.has((role || "").toLowerCase());
/** May acknowledge / resolve a discrepancy (never a support operator, silently). */
export const canResolveDiscrepancy = (role: string): boolean => RESOLVER_ROLES.has((role || "").toLowerCase());
