// ============================================================================
// ZONO — Meta OAuth CALLBACK (server-only). Verifies CSRF state, exchanges the
// code for a (long-lived) token, fetches identity, encrypts + stores the token,
// and marks the meta_oauth path connected. NEVER logs the token, returns it to
// the client, or puts it in the redirect URL. Errors are handled honestly.
//
// Detailed step-by-step server logs are emitted under the [meta-oauth-callback]
// tag so the full flow (call → code → token exchange → identity → DB save →
// UI status) can be traced in server logs. Tokens are NEVER logged.
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
const LOG = "[meta-oauth-callback]";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const origin = req.nextUrl.origin;
  const clearCookie = (res: NextResponse) => {
    res.cookies.set("meta_oauth_nonce", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth/meta", maxAge: 0 });
    return res;
  };
  const back = (params: string) => {
    console.log(`${LOG} STEP 9: redirecting back to ${SETTINGS}?${params} (elapsed ${Date.now() - t0}ms)`);
    return clearCookie(NextResponse.redirect(new URL(`${SETTINGS}?${params}`, origin)));
  };

  // STEP 1 — the route was hit. Confirms /api/oauth/meta/callback is being called.
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const fbError = sp.get("error");
  const fbErrorReason = sp.get("error_reason");
  const fbErrorDescription = sp.get("error_description");
  console.log(
    `${LOG} STEP 1: callback HIT. origin=${origin} ` +
    `code_present=${code ? "yes" : "NO"} state_present=${state ? "yes" : "NO"} ` +
    `fb_error=${fbError ?? "none"}${fbError ? ` reason=${fbErrorReason ?? "?"} desc=${fbErrorDescription ?? "?"}` : ""}`,
  );

  // STEP 2 — Meta returned an explicit error (e.g. user denied). Honest, no token.
  if (fbError) {
    console.warn(`${LOG} STEP 2: Meta returned error=${fbError} — marking path 'error', no token stored.`);
    await facebookConnectionPathService.setMetaStatus("error", { reason: fbError }).catch(() => {});
    return back("meta=error");
  }

  // STEP 3 — config + encryption must be present.
  const cfg = getMetaOAuthConfig();
  if (!cfg.configured) {
    console.error(`${LOG} STEP 3: env NOT configured — missing=${JSON.stringify(cfg.missing)}. Redirecting setup_required.`);
    return back("meta=setup_required");
  }
  if (!isEncryptionConfigured()) {
    console.error(`${LOG} STEP 3: ZONO_ENCRYPTION_KEY missing/invalid — cannot encrypt token. Redirecting error.`);
    return back("meta=error&reason=encryption");
  }
  console.log(`${LOG} STEP 3: config OK (graphVersion=${cfg.graphVersion}, configId=${cfg.configId || "(none)"}), encryption OK.`);

  // STEP 4 — verify session, then CSRF state against the httpOnly cookie + session identity.
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) {
    console.error(`${LOG} STEP 4: NO active session/org (user=${user ? "yes" : "no"}, org_id=${profile?.org_id ?? "none"}). Redirecting /login.`);
    return NextResponse.redirect(new URL("/login", origin));
  }
  console.log(`${LOG} STEP 4: session OK — user_id=${user.id} org_id=${profile.org_id} profile_id=${profile.id ?? "?"}`);

  const cookieNonce = req.cookies.get("meta_oauth_nonce")?.value ?? "";
  const payload = state ? verifySignedState(state, cookieNonce, process.env.META_APP_SECRET as string) : null;
  if (!payload) {
    console.error(`${LOG} STEP 5: state verification FAILED (bad signature/expired/nonce mismatch). cookie_nonce_present=${cookieNonce ? "yes" : "NO"}`);
    return back("meta=error&reason=state");
  }
  if (payload.orgId !== profile.org_id || payload.userId !== user.id) {
    console.error(`${LOG} STEP 5: state identity MISMATCH (state.org=${payload.orgId} vs session.org=${profile.org_id}).`);
    return back("meta=error&reason=state");
  }
  if (!code) {
    console.error(`${LOG} STEP 5: no authorization code present after state check.`);
    return back("meta=error&reason=state");
  }
  console.log(`${LOG} STEP 5: CSRF state verified + identity matched. Authorization code received (length=${code.length}).`);

  // STEP 6+ — exchange code → token → long-lived; fetch identity; encrypt; store.
  try {
    console.log(`${LOG} STEP 6: exchanging authorization code for short-lived token...`);
    const short = await exchangeCodeForToken(cfg, code);
    console.log(`${LOG} STEP 6: short-lived token OK (expires_in=${short.expiresInSec ?? "null"}s). [token value not logged]`);

    console.log(`${LOG} STEP 7: exchanging short → long-lived token...`);
    const long = await exchangeForLongLived(cfg, short.accessToken);
    console.log(`${LOG} STEP 7: long-lived token OK (expires_in=${long.expiresInSec ?? "null"}s). [token value not logged]`);

    console.log(`${LOG} STEP 8: fetching identity (GET /me?fields=id,name)...`);
    const identity = await fetchIdentity(cfg, long.accessToken);
    console.log(`${LOG} STEP 8: identity OK — id=${identity.id} name=${identity.name}`);
    // NOTE: user Pages (GET /me/accounts) are intentionally NOT fetched in this
    // phase — connection discovery only. Page ingestion is a later phase.

    const expiresInSec = long.expiresInSec ?? short.expiresInSec;
    const tokenExpiresAt = expiresInSec ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null;

    // Encrypt then store — token only ever lives encrypted at rest.
    console.log(`${LOG} STEP 8b: encrypting access token (AES-256-GCM) before persistence...`);
    const accessTokenEncrypted = encryptSecret(long.accessToken);

    console.log(`${LOG} STEP 8c: persisting connection to Supabase table 'distribution_provider_connections' (provider=facebook)...`);
    const stored = await providerConnectionRepository.storeMetaConnection({
      accessTokenEncrypted, tokenExpiresAt, scopes: INITIAL_SCOPES,
      externalAccountId: identity.id, displayName: identity.name,
    });
    if (!stored) {
      console.error(`${LOG} STEP 8c: DB SAVE FAILED (storeMetaConnection returned false — see [provider-connections] log above for code/message). Redirecting error.`);
      return back("meta=error&reason=store");
    }
    console.log(`${LOG} STEP 8c: DB save OK.`);

    console.log(`${LOG} STEP 8d: updating facebook_connection_paths meta_oauth status → connected (UI status)...`);
    const pathOk = await facebookConnectionPathService.setMetaStatus("connected", {
      account_name: identity.name, account_id: identity.id, scopes: INITIAL_SCOPES,
    });
    console.log(`${LOG} STEP 8d: path status update ${pathOk ? "OK" : "FAILED (UI may still read provider row)"}.`);

    return back("meta=connected");
  } catch (err) {
    // Never leak the token; log the failure cause and mark error honestly.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} STEP 6-8: token exchange / identity / encrypt FAILED — ${msg}`);
    await facebookConnectionPathService.setMetaStatus("error", { reason: "exchange_failed" }).catch(() => {});
    return back("meta=error&reason=exchange");
  }
}
