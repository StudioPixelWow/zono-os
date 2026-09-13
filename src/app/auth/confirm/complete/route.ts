import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The ACTUAL one-time-token verification, reached only after the user clicks the
 * button on the /auth/confirm interstitial. Splitting verify behind a user click
 * is what protects the single-use recovery token from being silently consumed by
 * email link-scanners / prefetchers (Gmail, Outlook SafeLinks, corporate proxies)
 * — they fetch the email's link (the interstitial, which does NOT verify) but do
 * not click buttons, so the token survives until the real person continues.
 *
 * verifyOtp with a token_hash needs no browser code_verifier (unlike the PKCE
 * `?code=` flow), so this works in ANY browser. On success we write the session
 * cookies and forward to `next` (e.g. /reset-password).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    console.error("[auth/confirm/complete] verifyOtp failed:", error.message);
    // Token expired or already used — send the user somewhere they can recover,
    // not a bare login page: the forgot-password screen with a clear message.
    return NextResponse.redirect(`${origin}/forgot-password?expired=1`);
  }
  return NextResponse.redirect(`${origin}/forgot-password?expired=1`);
}
