import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";
import { supabasePublicEnv, supabaseServiceRoleKey } from "./env";
import { getServiceRoleOrgContext } from "./server-context";

/**
 * Server-side Supabase client for Server Components, Route Handlers and
 * Server Actions. Reads/writes the auth cookie via Next's async `cookies()`.
 *
 * Cron/background exception: inside `runWithServiceRoleOrg()` (no user session)
 * this returns the service-role client so existing session-scoped code can run.
 * In that mode RLS is bypassed, so callers MUST scope every query by org_id.
 *
 * @example
 *   const supabase = await createClient();
 *   const { data } = await supabase.from("properties").select("*");
 */
export async function createClient() {
  // Cron/background org context → use service-role (no cookies available).
  if (getServiceRoleOrgContext()) return createServiceRoleClient();

  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabasePublicEnv.url(),
    supabasePublicEnv.anonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component where cookies are
            // read-only. Safe to ignore when auth refresh runs in middleware.
          }
        },
      },
    },
  );
}

/**
 * Privileged server client using the service-role key. Bypasses RLS.
 *
 * Use ONLY in trusted server-side code (admin tasks, background jobs, seeding).
 * Never expose this client or its key to the browser.
 */
export function createServiceRoleClient() {
  return createServerClient<Database>(
    supabasePublicEnv.url(),
    supabaseServiceRoleKey(),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* no-op: service-role client is stateless */
        },
      },
    },
  );
}
