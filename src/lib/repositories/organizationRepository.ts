/**
 * Organization repository — reads run under the caller's RLS session; creating
 * an organization runs under service-role (no authenticated INSERT policy on
 * organizations by design) and seeds the default system roles.
 *
 * Server-only. Never import from a Client Component.
 */
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type OrganizationInsert = Database["public"]["Tables"]["organizations"]["Insert"];
type RoleRow = Database["public"]["Tables"]["roles"]["Row"];

/** Fetch an organization by id under the caller's RLS session. */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/**
 * Create an organization and seed its default system roles (service-role).
 *
 * P9.0 idempotency: when `opts.createdByUserId` is supplied, the org is stamped
 * with it. A concurrent double-submit / retry by the SAME user violates the
 * partial unique index `organizations_created_by_user_uq` (23505) — we catch it
 * and return the org that already exists for that user, so onboarding never
 * creates two organizations (or an orphaned owner-less one). Role seeding is
 * idempotent (unique(org_id,key) DO NOTHING).
 */
export async function createOrganizationWithRoles(
  input: OrganizationInsert,
  opts: { createdByUserId?: string } = {},
): Promise<Organization> {
  const supabase = createServiceRoleClient();
  const row = (opts.createdByUserId ? { ...input, created_by_user_id: opts.createdByUserId } : input) as OrganizationInsert;

  const { data: org, error } = await supabase
    .from("organizations")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    // Concurrent creation by the same user → return the existing org (idempotent).
    const isUnique = error.code === "23505" || /created_by_user_uq|duplicate key|unique/i.test(error.message);
    if (isUnique && opts.createdByUserId) {
      const { data: existing } = await supabase
        .from("organizations").select("*").eq("created_by_user_id" as never, opts.createdByUserId as never).maybeSingle();
      if (existing) return existing as Organization;
    }
    throw new Error(`Failed to create organization: ${error.message}`);
  }

  const { error: rolesError } = await supabase.rpc("seed_org_default_roles", { p_org: org.id });
  if (rolesError) throw new Error(`Failed to seed roles: ${rolesError.message}`);

  return org;
}

/** Resolve a role id by its key within an organization (service-role). */
export async function getRoleIdByKey(
  orgId: string,
  key: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("roles")
    .select("id")
    .eq("org_id", orgId)
    .eq("key", key)
    .maybeSingle<Pick<RoleRow, "id">>();
  return data?.id ?? null;
}
