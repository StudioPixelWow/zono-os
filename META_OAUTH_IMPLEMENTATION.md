# Meta OAuth — Implementation (PHASE 18)

This document describes the **real** Meta (Facebook) OAuth handshake wired into
ZONO. It covers **only** the connection handshake: starting the OAuth flow and
processing the callback. **No publishing, WhatsApp sending, Lead Ads ingestion,
or analytics are built here** — those are later phases.

## OAuth flow

```
User clicks "חבר Meta"  →  GET /api/oauth/meta/start
        │
        │  1. Require logged-in org user (else → /login)
        │  2. Require Meta env configured (else → ?meta=setup_required)
        │  3. Create HMAC-signed state bound to {orgId, userId, nonce, exp}
        │  4. Set httpOnly cookie `meta_oauth_nonce` (the nonce only)
        │  5. 302 → https://www.facebook.com/<ver>/dialog/oauth?...
        ▼
Facebook Login dialog (user consents to public_profile)
        │
        ▼
GET /api/oauth/meta/callback?code=...&state=...
        │  1. If `error` present → setMetaStatus("error") → ?meta=error
        │  2. Require env configured + encryption configured
        │  3. Verify session, then verify signed state against the cookie nonce
        │     AND that state.orgId / state.userId match the session (CSRF)
        │  4. Exchange code → short-lived token
        │  5. Exchange short → long-lived token (fb_exchange_token)
        │  6. GET /me?fields=id,name  (identity)
        │  7. encryptSecret(token)  → AES-256-GCM
        │  8. storeMetaConnection(...) into distribution_provider_connections
        │  9. setMetaStatus("connected", {account_name, account_id, scopes})
        │ 10. Clear nonce cookie → ?meta=connected
        ▼
Back to /settings/distribution-connections (card shows connected + account name)
```

## Required Meta app settings

In the Meta App dashboard (developers.facebook.com):

1. Create an app of type **Business**.
2. Add the **Facebook Login** product.
3. Under Facebook Login → Settings, add the **Valid OAuth Redirect URI**:
   it must exactly match `META_OAUTH_REDIRECT_URI` (see below).
4. Note the **App ID** and **App Secret** (App Secret is server-only).
5. Publishing-related scopes (Pages, Instagram, Lead Ads, WhatsApp, analytics)
   require **Meta App Review + Business Verification**. They are intentionally
   **not** requested here — the initial connection only requests `public_profile`.

## Redirect URI

The redirect URI registered in the Meta app **must byte-for-byte match**
`META_OAUTH_REDIRECT_URI`. For ZONO it is:

```
https://<your-domain>/api/oauth/meta/callback
```

For local development use the deployed/tunneled HTTPS origin (Facebook requires
HTTPS for OAuth redirect URIs).

## Environment variables

| Variable                  | Required | Purpose                                                        |
| ------------------------- | -------- | -------------------------------------------------------------- |
| `META_APP_ID`             | yes      | Meta app client id (used in the authorize URL).                |
| `META_APP_SECRET`         | yes      | Meta app secret — token exchange **and** HMAC state signing.   |
| `META_OAUTH_REDIRECT_URI` | yes      | Must match the Meta app's registered OAuth redirect URI.       |
| `META_GRAPH_VERSION`      | yes      | Graph API version, e.g. `v21.0`.                               |
| `ZONO_ENCRYPTION_KEY`     | yes      | ≥16 chars. Derives the AES-256-GCM key for token-at-rest.      |

If any of the four `META_*` vars is missing, both routes redirect honestly to
`?meta=setup_required` and the UI shows "נדרשת הגדרת Meta" with a disabled
button — nothing crashes and nothing is faked. The callback additionally
requires `ZONO_ENCRYPTION_KEY`; if missing it returns `?meta=error&reason=encryption`
and never stores an unencrypted token.

## Token storage model

- The access token is encrypted with **AES-256-GCM** (`src/lib/security/crypto.ts`,
  `encryptSecret` → `"v1:<base64(iv|tag|ciphertext)>"`) **before** any DB write.
- It is stored only in
  `distribution_provider_connections.access_token_encrypted`
  (row keyed by `org_id, provider='facebook'`), together with
  `token_expires_at`, `scopes`, `external_account_id`, `display_name`,
  `status='connected'`, `connection_mode='api'`.
- `facebook_connection_paths` (path_type `meta_oauth`) stores **only
  non-sensitive** status metadata (`account_name`, `account_id`, `scopes`) via a
  `stripSensitive` filter that drops any key matching
  `password|cookie|session|token|secret|credential|auth`. The **token is never
  written to this table.**

## Security notes

- **CSRF / state validation**: state is an HMAC-signed payload
  (`{orgId, userId, nonce, exp}`) using `META_APP_SECRET`, compared with
  `timingSafeEqual`. The matching nonce is held in an httpOnly,
  `secure`, `sameSite=lax` cookie scoped to `/api/oauth/meta` with a 10-minute
  max-age. The callback additionally checks that `orgId`/`userId` in the verified
  state match the current session — a triple check (signature + cookie nonce +
  session identity).
- **No token in logs**: the token is never `console.log`-ed; errors are logged
  generically.
- **No token in client response**: the token is never returned to the browser.
- **No token in URL**: the post-callback redirect carries only a status flag
  (`?meta=connected|error|setup_required`), never the token.
- **Honest failure**: revoked/expired/denied/error responses mark
  `meta_oauth` status `error` and never flip to `connected`.

## Current limitations (intentional)

- Only `public_profile` is requested — enough to establish a connection and read
  basic identity. No Pages / Instagram / Lead Ads / WhatsApp / analytics scopes.
- **No publishing** of any kind.
- **No WhatsApp sending.**
- **No Lead Ads ingestion.**
- **No analytics.**
- No automated token refresh job yet (long-lived token expiry is stored in
  `token_expires_at` for a future refresh/reconnect phase; the UI offers
  "התחבר מחדש" on `expired`/`error`).
- Production use of any scope beyond `public_profile` requires Meta App Review +
  Business Verification.

## Files

- `src/lib/security/crypto.ts` — AES-256-GCM encrypt/decrypt helpers (server-only).
- `src/lib/distribution/meta-oauth.ts` — config, signed-state create/verify,
  authorize-URL builder, code/long-lived token exchange, identity fetch.
- `src/lib/distribution/provider-connections.ts` — `storeMetaConnection` (encrypted upsert).
- `src/lib/distribution/facebook-connection-paths.ts` — `setMetaStatus` (non-sensitive path status).
- `src/app/api/oauth/meta/start/route.ts` — start route.
- `src/app/api/oauth/meta/callback/route.ts` — callback route.
- `src/app/(app)/settings/distribution-connections/page.tsx` + `DistributionConnectionsView.tsx` — UI wiring.
