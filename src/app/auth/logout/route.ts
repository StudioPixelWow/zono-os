import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Logout endpoint. Usable as a link (GET) or form post (POST); signs out and
 * redirects to the login page. (A `signOut` server action also exists in
 * src/lib/auth/actions.ts for use from buttons.)
 */
async function handle(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const GET = handle;
export const POST = handle;
