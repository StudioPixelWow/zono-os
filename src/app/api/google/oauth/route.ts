// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — OAuth START (server route).
//
// GET /api/google/oauth → begins per-user Google OAuth. Requires an authenticated
// session; refuses (redirects back) unless the Google app env is configured AND
// operator-enabled. Generates PKCE (S256) + an HMAC-signed state, stores the
// verifier + nonce in httpOnly cookies, and redirects the user to Google consent.
// No token is ever created here.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  getGoogleOAuthConfig, buildAuthorizeUrl, createPkcePair, createSignedState, stateSecret,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  const cfg = getGoogleOAuthConfig();
  if (!cfg.ready) {
    return NextResponse.redirect(new URL(`/settings/integrations?google_error=${cfg.configured ? "not_enabled" : "not_configured"}`, origin));
  }

  const { verifier, challenge } = createPkcePair();
  const { state, nonce } = createSignedState(sc.profile.org_id, sc.user.id, stateSecret());
  const url = buildAuthorizeUrl(cfg, state, challenge);

  const res = NextResponse.redirect(url);
  const cookieOpts = { httpOnly: true as const, secure: true as const, sameSite: "lax" as const, path: "/api/google/oauth", maxAge: 600 };
  res.cookies.set("g_oauth_nonce", nonce, cookieOpts);
  res.cookies.set("g_oauth_verifier", verifier, cookieOpts);
  return res;
}
