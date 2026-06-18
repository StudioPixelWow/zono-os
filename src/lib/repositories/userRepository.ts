/**
 * User repository — current-user reads run under the caller's RLS session;
 * provisioning writes (first onboarding) run under service-role because the
 * brand-new user has no role yet and RLS would reject the insert. All writes
 * are scoped to the authenticated user's id by the caller.
 *
 * Server-only. Never import from a Client Component.
 */
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type UserProfile = Database["public"]["Tables"]["users"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

/** The current authenticated user's profile row, or null if none exists yet. */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data ?? null;
}

/**
 * Create or update the calling user's profile row (used by onboarding).
 * Runs under service-role; the caller must pass the authenticated user's id.
 */
export async function provisionUserProfile(input: UserInsert): Promise<UserProfile> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .upsert(input, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to provision user profile: ${error.message}`);
  return data;
}
