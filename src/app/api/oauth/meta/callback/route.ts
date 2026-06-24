// ============================================================================
// ZONO — Meta OAuth CALLBACK (server-only). Verifies CSRF state, exchanges the
// code for a (long-lived) token, fetches identity, encrypts + stores the token,
// and marks the meta_oauth path connected. NEVER logs the token, returns it to
// the client, or puts it in the redirect URL. Errors are handled honestly.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  getMetaOAuthConfig, verifySignedState, exchangeCodeForToken, exchangeForLongLived, fetchIdentity, INITIAL_SCOPES,
} from "@/lib/distribution/meta-oauth";
import { isEncryptionConfigured, encryptSecret } from "@/lib/security/crypto";
import { providerConnectionRepository } from "@/lib/distribution/provider-connections";
import { facebookConnectionPathService } from "@/lib/distribution/facebook-connection-paths";

const SETTINGS = "/settings/distribution-connections";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const clearCookie = (res: NextResponse) => {
    res.cookies.set("meta_oauth_nonce", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth/meta", maxAge: 0 });
    return res;
  };
  const back = (params: string) => clearCookie(NextResponse.redirect(new URL(`${SETTINGS}?${params}`, origin)));

  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const fbError = sp.get("error");

  // 1) User denied / Meta returned an error — honest, no token.
  if (fbError) {
    await facebookConnectionPathService.setMetaStatus("error", { reason: fbError }).catch(() => {});
    return back("meta=error");
  }

  // 2) Config + encryption must be present.
  const cfg = getMetaOAuthConfig();
  if (!cfg.configured) return back("meta=setup_required");
  if (!isEncryptionConfigured()) return back("meta=error&reason=encryption");

  // 3) Verify CSRF state against the httpOnly cookie + the session identity.
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return NextResponse.redirect(new URL("/login", origin));
  const cookieNonce = req.cookies.get("meta_oauth_nonce")?.value ?? "";
  const payload = state ? verifySignedState(state, cookieNonce, process.env.META_APP_SECRET as string) : null;
  if (!payload || payload.orgId !== profile.org_id || payload.userId !== user.id || !code) {
    return back("meta=error&reason=state");
  }

  // 4) Exchange code → token → long-lived; fetch identity.
  try {
    const short = await exchangeCodeForToken(cfg, code);
    const long = await exchangeForLongLived(cfg, short.accessToken);
    const identity = await fetchIdentity(cfg, long.accessToken);
    const expiresInSec = long.expiresInSec ?? short.expiresInSec;
    const tokenExpiresAt = expiresInSec ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null;

    // 5) Encrypt then store — token only ever lives encrypted at rest.
    const accessTokenEncrypted = encryptSecret(long.accessToken);
    const stored = await providerConnectionRepository.storeMetaConnection({
      accessTokenEncrypted, tokenExpiresAt, scopes: INITIAL_SCOPES,
      externalAccountId: identity.id, displayName: identity.name,
    });
    if (!stored) return back("meta=error&reason=store");

    await facebookConnectionPathService.setMetaStatus("connected", {
      account_name: identity.name, account_id: identity.id, scopes: INITIAL_SCOPES,
    });
    return back("meta=connected");
  } catch {
    // Never leak details/token; mark error honestly.
    await facebookConnectionPathService.setMetaStatus("error", { reason: "exchange_failed" }).catch(() => {});
    return back("meta=error&reason=exchange");
  }
}
