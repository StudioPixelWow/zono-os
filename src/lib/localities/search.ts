import { createClient } from "@/lib/supabase/client";

/** Minimal locality shape used by the onboarding autocomplete. */
export interface LocalityOption {
  id: string;
  locality_code: string;
  name_he: string;
  subdistrict: string | null;
}

/**
 * Search active Israeli localities by Hebrew name (client-side; reads
 * public.israel_localities, which is public-readable). Empty query returns the
 * first localities alphabetically.
 */
export async function searchLocalities(
  query: string,
  limit = 20,
): Promise<LocalityOption[]> {
  const supabase = createClient();
  let q = supabase
    .from("israel_localities")
    .select("id, locality_code, name_he, subdistrict")
    .eq("is_active", true)
    .order("name_he")
    .limit(limit);

  const term = query.trim();
  if (term) q = q.ilike("name_he", `%${term}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LocalityOption[];
}
