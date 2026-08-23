// ============================================================================
// ZONO — People · write repository (owner assignment).
// ----------------------------------------------------------------------------
// A person is a read-time unification of buyer/seller/lead records; there is no
// separate "person" row to own. Assigning a person to an agent therefore means
// re-pointing owner_id on each of that person's underlying role records. Writes
// are manager-gated (has_min_role), org-scoped, and go through the service-role
// client so a forged/cross-org id can never be mutated (org_id is re-checked in
// the WHERE clause — no service-role IDOR). Server-only.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export type ContactRole = "buyer" | "seller" | "lead";
const TABLES: Record<ContactRole, string> = { buyer: "buyers", seller: "sellers", lead: "leads" };

async function peopleWriteCtx(minRole: "agent" | "manager"): Promise<{ orgId: string; userId: string; svc: ReturnType<typeof createServiceRoleClient> }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("not authenticated");
  const auth = await createClient();
  const { data: ok } = await auth.rpc("has_min_role", { p_min: minRole });
  if (ok !== true) throw new Error("אין הרשאה מספקת לפעולה זו.");
  return { orgId: profile.org_id, userId: user.id, svc: createServiceRoleClient() };
}

/** Re-point owner_id on ONE role record (org-scoped). Manager-gated. */
export async function setContactOwner(role: ContactRole, id: string, ownerUserId: string | null): Promise<void> {
  if (!TABLES[role]) throw new Error("תפקיד לא חוקי");
  const { orgId, svc } = await peopleWriteCtx("manager");
  const { error } = await svc.from(TABLES[role] as never).update({ owner_id: ownerUserId } as never).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
