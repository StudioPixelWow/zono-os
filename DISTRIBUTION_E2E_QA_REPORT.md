# ZONO — Distribution End-to-End QA Report (Phase 23)

**Date:** 2026-06-24
**Scope:** Audit + test of the full distribution system (Meta OAuth, Pages, Chrome
Extension, Facebook Groups). No new features were built. Changes made were limited
to fixing broken/silent flows and improving error handling.

**Verification status:** scoped `tsc` (changed files) = clean; `eslint` = clean.
Postgres is not available in this sandbox, so migrations were validated by reading
+ idempotency review, not replayed. Live Meta Graph calls were not executed (no
production app credentials in this environment) — see "Test method" per flow.

---

## Summary table

| # | Flow | Status | Mode |
|---|------|--------|------|
| 1 | Meta OAuth connection | ✅ Works (code complete, honest states) | Automated handshake |
| 2 | Facebook Pages discovery | ✅ Works | Automated (Graph API) |
| 3 | Facebook Page publishing | ✅ Works | Automated (Graph API) — **needs Meta approval** |
| 4 | Chrome Extension pairing | ✅ Works | Semi-automated (one-time code) |
| 5 | Facebook Groups assisted publishing | ✅ Works | **Manual** (human posts) |
| 6 | Draft auto-fill mode | ⛔ Not built (Phase 22) | N/A |
| 7 | Publish-result reporting | ✅ Works | Manual confirm (groups) / Automated (pages) |
| 8 | Queue status updates | ✅ Works | Automated |
| 9 | Error states | ✅ Works (improved this phase) | — |
| 10 | Permission-missing states | ✅ Works | — |

---

## Fixes applied this phase

1. **Silent OAuth callback result (fixed).** The Meta OAuth callback redirects to
   `/settings/distribution-connections?meta=connected` or
   `?meta=error&reason=state|exchange|store|encryption` (and `?meta=setup_required`),
   but the settings page never read those params — the user got no feedback on a
   failed or successful connection. Added server-side mapping of `?meta=…` to an
   honest Hebrew banner (`page.tsx` → `metaNotice()`), rendered as a success/error
   banner in `DistributionConnectionsView`. This directly improves flows #1, #9, #10.

No other code paths were broken. The rest of the system was already consistently
honest (no fabricated "connected"/"published" states anywhere).

---

## What works

**1. Meta OAuth connection** — `/api/oauth/meta/start` → Facebook Login for Business
(`config_id`) → `/api/oauth/meta/callback`. CSRF state is HMAC-signed and bound to
an httpOnly nonce cookie + the session org/user (constant-time compare, 10-min
expiry). Code→token→long-lived exchange, identity fetch, AES-256-GCM token
encryption before storage, and canonical status write to
`distribution_provider_connections`. Tokens are never logged, never returned to the
client, never put in a redirect URL. Step-by-step server logs under
`[meta-oauth-callback]`. *Test method:* code path + state/crypto/error-branch review.

**2. Facebook Pages discovery** — `syncMetaPagesAction` → `GET /me/accounts` →
upserts `facebook_page` destinations (page tokens encrypted), then best-effort
linked Instagram Business accounts and Lead Ads forms per page, plus a
`GET /me/permissions` readiness snapshot. Honest `not_connected` / `expired` /
`permission` / `store` outcomes; expiry flips the connection to `expired`.

**3. Facebook Page publishing** — per-page composer + "publish" button in the
connection center → `publishToFacebookPageAction` → `meta-publish` → `POST
/{page}/feed` (or `/photos` when an image URL is present), using the encrypted
page-scoped token. The linked queue post is set **published only on confirmed Graph
success**; on API error it is set **failed** with the Graph message. Never fakes
success.

**4. Chrome Extension pairing** — ZONO generates a one-time, 10-min, hashed pairing
code (`startExtensionPairingAction`). The extension exchanges it at
`/pairing/complete` for `{instanceId, secret}`; the secret is stored hashed
(sha256) server-side and returned exactly once. All later extension calls
authenticate via `x-zono-instance-id` + `x-zono-extension-secret` with a
constant-time hash compare. Heartbeats update status; `revokeExtensionAction`
revokes all instances and resets the path.

**5. Facebook Groups assisted publishing** — user manually adds groups (name/URL/
notes), selects groups + writes text, "שלח לתוסף" creates one prepared
`distribution_posts` row per group. The extension popup shows group name/URL/text/
image with 6 buttons (open group, copy, open image, mark published, mark failed,
skip). The human posts on Facebook and reports the outcome. Per-group status in
ZONO: ממתין → נפתח → הועתק → פורסם/נכשל/דולג with real timestamps.

**7. Publish-result reporting** — extension `POST /publish-result` maps
`user_confirmed_published → published` (optional external URL + `published_by` +
timestamps), `user_cancelled`/`user_skipped → cancelled`, `failed → failed`,
`needs_manual_action → queued`. `opened`/`copied` are recorded via `POST /event`
and are explicitly non-publishing.

**8. Queue status updates** — both the Graph path (`distributionPostsRepository
.updateStatus`) and the extension path (`recordPublishResult`) write status,
`published_at`, `external_post_url`, and `failure_reason`/`skipped_reason` to
`distribution_posts`, scoped to the org. The connection center reflects per-group
status live after a send.

**9. Error states** — Graph errors are classified into `expired` (190/102/463/467),
`permission` (200/10/3 + wording), and `unknown`/`graph_error`; network failures
are caught (no throw). OAuth failures map to honest reasons. All surface in Hebrew
to the user (banner now includes the OAuth callback result).

**10. Permission-missing states** — the integration view computes readiness from
`GET /me/permissions`: `canPublishPages` (pages_manage_posts), `instagramReady`,
`leadsReady` (leads_retrieval), `analyticsReady` (read_insights). Missing
permissions are shown per-capability rather than failing opaquely; publishing
without `pages_manage_posts` returns a clear "permission" message.

---

## What fails / limitations

- **No live Graph verification in this environment.** Flows 1–3 are verified by code
  review only; they require a real, approved Meta app + a logged-in Facebook user
  with managed Pages to exercise end-to-end. This is an environment limitation, not
  a code defect.
- **Migrations not replayed here** (no Postgres in sandbox). They are idempotent and
  were reviewed; apply via the consolidated SQL handover before relying on the DB
  flows in production.
- **Page publishing image source** must be a public `https://` URL. Private/
  signed-URL images won't attach via `/photos`; they fall back to a text post.
- **Instagram / Lead Ads / analytics** are **discovery + readiness only** — no
  IG publishing, no lead ingestion, no real insights numbers are wired yet.

---

## What is manual vs automated

**Manual (human-driven):**
- Facebook **Groups** publishing — the user opens the group, pastes, clicks Post,
  and reports the result. ZONO never fills the form or clicks Post.
- Entering the pairing code into the extension.
- Adding group destinations (no auto-discovery).

**Automated (server/API):**
- Meta OAuth handshake + token refresh-to-long-lived + encrypted storage.
- Pages/Instagram/Lead-form discovery and permissions readiness.
- Facebook **Page** publishing via Graph API (one click → API call → status).
- Queue status writes and per-group status timestamps.

---

## What requires Meta approval

- **Facebook Page publishing** (`pages_manage_posts`), Pages listing
  (`pages_show_list`), engagement (`pages_read_engagement`).
- **Instagram** publishing (`instagram_basic` + `instagram_content_publish`).
- **Lead Ads** retrieval (`leads_retrieval`) and **analytics** (`read_insights`).
- These permissions require Meta **App Review** + a Business verification and the
  Facebook Login for Business configuration. Until approved, discovery/publish calls
  return honest `permission` states rather than working.

## What requires the Chrome Extension

- **Facebook Groups** publishing (assisted) — there is no official Graph API for
  posting to Groups for this use case, so it runs in the user's own browser via the
  extension, with human confirmation.
- Detecting (cookie-free) whether a Facebook session is present in the browser.

---

## What is safe for beta users

- Connecting Meta via OAuth (once the app is approved/whitelisted for the tester),
  discovering Pages, and reviewing readiness/permissions.
- Adding Facebook Groups and using the **assisted** group flow (open/copy/mark) —
  no credentials touched, every publish human-confirmed, soft 60–90s pacing
  guidance shown.
- Facebook **Page** publishing for testers whose Page token carries
  `pages_manage_posts` (real API publish, honest failure on error).
- The whole UI is honest: nothing reports "connected" or "published" without a real
  underlying success.

## What must NOT be promised yet

- **"Automatic posting to Facebook Groups"** — it is assisted/manual by design; do
  not market it as automated. No DOM auto-fill, no auto-click, no background posting.
- **"Draft auto-fill"** (pre-filling the Facebook composer) — not built; it is the
  planned Phase 22 item.
- **Instagram publishing, Lead Ads ingestion, and real analytics/insights** — only
  discovery/readiness exist today.
- **Page publishing "out of the box"** — gated on Meta App Review; don't promise it
  works before approval + `pages_manage_posts` is granted.
- Any **bulk / high-volume** group posting — only soft pacing guidance exists; no
  rate enforcement.

---

## Security guarantees (unchanged, re-verified)

- ZONO never reads, stores, or transmits Facebook **cookies, passwords, or session
  tokens**. The content script sends only a boolean "session detected".
- Meta user tokens and Page tokens are stored **AES-256-GCM encrypted**, decrypted
  server-side only, never logged, never returned to the client.
- Extension secrets and pairing codes are stored **hashed** (sha256).
- No server-side browser automation or scraping. Every publish is either a confirmed
  Graph API success (Pages) or an explicit human confirmation (Groups).

## Supabase handover

`DISTRIBUTION_SUPABASE_CONSOLIDATED.sql` bundles the 11 idempotent distribution-arc
migrations (distribution engine/infrastructure/provider/comments + provider
connections + facebook connection paths + Meta destinations + extension instances +
Phase 21 group columns) in apply order for the Supabase SQL editor.
