// ============================================================================
// ZONO — canonical server-side ROLE-KEY resolver (server-only). Role lives on
// `roles.key` (joined via `users.role_id`) — there is NO `users.role` column, so
// the widespread broken read that cast the profile to a `role` string and fell
// back to "agent" ALWAYS yielded "agent" and broke every Meta-Workspace gate
// (fail-closed). This is the single canonical resolver every gate should use. It
// returns the RAW roles.key string (owner/manager/agent/admin/org_admin/
// marketing_manager/content_creator/support/…) — never a narrowed set — so the
// existing allowlists keep their exact grants. Server-derived; never trusts a
// client-supplied role.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Resolve a user's canonical role key from their session profile (users.role_id →
 * roles.key). Fail-closed to "agent" when no role_id (e.g. the cron/service-role
 * session branch has no role_id) or the lookup fails. Pass the profile the caller
 * already holds from getSessionContext() to avoid a second session fetch.
 */
export async function resolveRoleKey(profile: { role_id?: string | null } | null | undefined): Promise<string> {
  const roleId = profile?.role_id ?? null;
  if (!roleId) return "agent";
  try {
    const db = createServiceRoleClient();
    const { data } = await db.from("roles").select("key").eq("id", roleId).maybeSingle();
    return (data as { key?: string } | null)?.key ?? "agent";
  } catch {
    return "agent"; // fail closed
  }
}
