import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabasePublicEnv } from "./env";

/**
 * Refreshes the Supabase auth session on every request and writes rotated
 * cookies back onto the response. Server Components can't write cookies, so
 * this middleware keeps the session fresh for them. No-op when Supabase isn't
 * configured (so the app still boots without env vars).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(
    supabasePublicEnv.url(),
    supabasePublicEnv.anonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the session so expired access tokens get refreshed.
  await supabase.auth.getUser();

  return response;
}
