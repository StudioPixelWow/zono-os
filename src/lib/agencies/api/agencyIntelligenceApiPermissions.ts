// ============================================================================
// ZONO — PHASE 26.13: API permission layer (SERVER-ONLY at the edges; the core
// decision is PURE + testable). Enforces organization isolation: a request for
// an org that is not the caller's session org is denied and the API returns an
// empty/null result instead of any cross-org data. RLS is the second guard.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { resolveOrgAccess, type OrgAccess } from "./agencyIntelligenceApiMappers";

export { resolveOrgAccess };
export type { OrgAccess };

/** Resolve the caller's session org id (null when unauthenticated/incomplete). */
export async function currentSessionOrgId(): Promise<string | null> {
  const { profile, state } = await getSessionContext();
  return state === "ready" ? (profile?.org_id ?? null) : null;
}

/** Server guard: confirm the caller may read the requested org. Never throws. */
export async function assertOrgAccess(requestedOrgId: string): Promise<OrgAccess> {
  return resolveOrgAccess(await currentSessionOrgId(), requestedOrgId);
}
