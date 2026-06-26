// ============================================================================
// ZONO — server-only execution context for cron/background jobs that have NO
// user session. Inside `runWithServiceRoleOrg(orgId, fn)`:
//   • createClient()      → returns the service-role client (RLS bypassed)
//   • getSessionContext() → returns a synthetic "ready" session for that org
//
// This lets the existing session-scoped intelligence code (decision brain etc.)
// run from the master cron WITHOUT a refactor — BUT every read must be EXPLICITLY
// org-scoped (we do not rely on RLS while service-role is active). Zero imports
// here to avoid cycles; consumed by supabase/server.ts + auth/session.ts.
// ============================================================================
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

interface ServiceRoleOrgContext {
  orgId: string;
}

const als = new AsyncLocalStorage<ServiceRoleOrgContext>();

/** Run `fn` with a service-role org context active (cron/background only). */
export function runWithServiceRoleOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ orgId }, fn);
}

/** The active service-role org context, or undefined in normal session flow. */
export function getServiceRoleOrgContext(): ServiceRoleOrgContext | undefined {
  return als.getStore();
}
