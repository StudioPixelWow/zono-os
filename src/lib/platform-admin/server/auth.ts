// ============================================================================
// ZONO — PLATFORM ADMIN authorization guard (server-only). P5.0.
// ----------------------------------------------------------------------------
// THE single authoritative platform-authorization implementation.
//   request → authenticated session → platform_operators lookup (service-role)
//           → status=active → role → operatorCan(capability) → fail-closed.
// It NEVER infers platform access from an organization role, NEVER trusts a
// client-supplied role/capability/orgId, and NEVER exposes service-role creds.
// The pure DECISION lives in ../capabilities.operatorCan; this file only
// resolves the operator identity from the database.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import {
  operatorCan, isPlatformRole,
  type PlatformCapability, type PlatformOperator, type PlatformOperatorStatus,
} from "../capabilities";

/** Thrown when a platform capability check fails. Carries a flag so route-level
 *  callers can translate to `notFound()` (avoid revealing platform routes). */
export class PlatformAuthError extends Error {
  readonly notFound = true;
  constructor(message = "not_found") { super(message); this.name = "PlatformAuthError"; }
}

interface RawOperatorRow { user_id: string; platform_role: string; status: string }

/**
 * Resolve the current caller's platform operator identity, or null when they are
 * not an operator. Reads `platform_operators` via the SERVICE ROLE (the table
 * has NO authenticated RLS read policy, so customers cannot enumerate operators;
 * only this server path can read it). Fail-closed: any missing prerequisite → null.
 */
export async function getCurrentPlatformOperator(): Promise<PlatformOperator | null> {
  if (!isServiceRoleConfigured()) return null;
  const { user } = await getSessionContext();
  if (!user?.id) return null; // must be a real authenticated user (not the cron synthetic session)

  const db = createServiceRoleClient();
  // `platform_operators` is added by an operator-gated migration and is not yet
  // in the generated Supabase types; cast the untyped-table access (repo pattern).
  const { data } = await db.from("platform_operators" as never)
    .select("user_id,platform_role,status")
    .eq("user_id" as never, user.id as never).maybeSingle();
  const row = (data as RawOperatorRow | null) ?? null;
  if (!row || !isPlatformRole(row.platform_role)) return null;
  return { userId: row.user_id, role: row.platform_role, status: row.status as PlatformOperatorStatus };
}

/**
 * Assert the current caller holds `capability`. Returns the resolved operator on
 * success; throws `PlatformAuthError` (fail-closed) otherwise. This is the ONLY
 * function the DAL / any future platform route may use to authorize.
 */
export async function assertPlatformCapability(capability: PlatformCapability): Promise<PlatformOperator> {
  const operator = await getCurrentPlatformOperator();
  if (!operatorCan(operator, capability)) throw new PlatformAuthError();
  return operator as PlatformOperator;
}

/** Non-throwing convenience: does the caller hold the capability? */
export async function currentOperatorCan(capability: PlatformCapability): Promise<boolean> {
  return operatorCan(await getCurrentPlatformOperator(), capability);
}
