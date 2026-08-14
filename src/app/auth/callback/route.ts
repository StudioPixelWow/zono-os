import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE auth callback. Email links that need to establish a session — password
 * recovery, magic link, and (optionally) signup confirmation — redirect here
 * with a `?code=`. We exchange it for a session (written to cookies by the SSR
 * client) and forward to `next`. Without this route those links land on the app
 * with no session and get bounced to /login.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  // Only allow same-origin relative redirects.
  const safeNext = next.startsWith("/") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    console.error("[auth/callback] code exchange failed:", error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
