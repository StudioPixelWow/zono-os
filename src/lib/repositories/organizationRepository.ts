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

/** Create an organization and seed its default system roles (service-role). */
export async function createOrganizationWithRoles(
  input: OrganizationInsert,
): Promise<Organization> {
  const supabase = createServiceRoleClient();

  const { data: org, error } = await supabase
    .from("organizations")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create organization: ${error.message}`);

  const { error: rolesError } = await supabase.rpc("seed_org_default_roles", {
    p_org: org.id,
  });
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
