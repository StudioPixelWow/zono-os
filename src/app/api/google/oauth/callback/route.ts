// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — OAuth CALLBACK (server route).
//
// GET /api/google/oauth/callback → completes the handshake. Re-checks the
// session, verifies the HMAC-signed state against the httpOnly nonce AND that
// the state's user matches the current session (no cross-user binding), reads
// the PKCE verifier cookie, exchanges the code, fetches identity, encrypts the
// tokens, and stores the connection via the SERVICE ROLE with the verified
// org/user. Tokens never reach the browser and are never logged (Part 7).
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  getGoogleOAuthConfig, verifySignedState, stateSecret, exchangeCodeForToken, fetchUserInfo, GOOGLE_SCOPES,
} from "@/lib/google/oauth";
import { upsertConnectionTokens } from "@/lib/google/tokens";
import { logAudit } from "@/lib/audit/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const done = (q: string) => NextResponse.redirect(new URL(`/settings/integrations?${q}`, origin));

  const err = url.searchParams.get("error");
  if (err) return done(`google_error=${encodeURIComponent(err)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return done("google_error=missing_code");

  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.redirect(new URL("/login", origin));

  // Verify CSRF state against the httpOnly nonce, and bind to THIS session.
  const nonce = request.headers.get("cookie")?.match(/(?:^|;\s*)g_oauth_nonce=([^;]+)/)?.[1] ?? "";
  const verifier = request.headers.get("cookie")?.match(/(?:^|;\s*)g_oauth_verifier=([^;]+)/)?.[1] ?? "";
  const payload = verifySignedState(state, decodeURIComponent(nonce), stateSecret());
  if (!payload || payload.userId !== sc.user.id || payload.orgId !== sc.profile.org_id) return done("google_error=bad_state");
  if (!verifier) return done("google_error=missing_verifier");

  const cfg = getGoogleOAuthConfig();
  if (!cfg.configured) return done("google_error=not_configured");

  let stage = "exchange";
  try {
    const tokens = await exchangeCodeForToken(cfg, code, decodeURIComponent(verifier));
    stage = "userinfo";
    const identity = await fetchUserInfo(tokens.accessToken);
    stage = "persist";
    const grantedScopes = tokens.scope ? tokens.scope.split(" ") : [...GOOGLE_SCOPES];
    await upsertConnectionTokens({
      orgId: sc.profile.org_id, userId: sc.user.id, googleSub: identity.sub, email: identity.email,
      displayName: identity.name, scopes: grantedScopes, accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken, expiresInSec: tokens.expiresInSec,
    });
    await logAudit({
      action: "google.connected", category: "configuration", entityType: "google_connection", entityId: identity.sub,
      summary: `Google Workspace connected: ${identity.email ?? identity.sub}`,
      metadata: { scopes: grantedScopes.length, email: identity.email },   // NEVER any token
    });
  } catch (e) {
    // TEMPORARY diagnostics (Batch 6.5 OAuth bring-up). Secret-safe: client id +
    // redirect uri are public; only LENGTHS of the secret/verifier/code are logged.
    console.error(`[google/callback] failed stage=${stage} msg=${(e as Error).message}`);
    console.error(`[google/callback] diag clientId=${cfg.clientId} redirectUri=${cfg.redirectUri} secretLen=${cfg.clientSecret.length} verifierLen=${decodeURIComponent(verifier).length} codeLen=${code.length}`);
    return done(`google_error=exchange_failed&stage=${stage}`);
  }

  // Clear the one-time handshake cookies.
  const res = done("google_connected=1");
  res.cookies.set("g_oauth_nonce", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google/oauth", maxAge: 0 });
  res.cookies.set("g_oauth_verifier", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google/oauth", maxAge: 0 });
  return res;
}
