import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-generated email link confirmation (token_hash flow) — the official
 * Supabase pattern for links minted on the SERVER (e.g. admin.generateLink).
 * Unlike the PKCE `?code=` flow (/auth/callback), verifyOtp with a token_hash
 * needs NO browser code_verifier, so a link created by our API works when the
 * user clicks it in ANY browser. Used by /start signup → "set your password".
 * On success the session cookies are written and we forward to `next`.
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
    console.error("[auth/confirm] verifyOtp failed:", error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_confirm`);
}
