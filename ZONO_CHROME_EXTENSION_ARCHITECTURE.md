# ZONO Chrome Extension — Architecture (Phase 20)

The Chrome extension is the **browser-assisted** path for publishing to **Facebook
Groups** and **Marketplace** — destinations the official Meta Graph API does not
serve for our use case. It runs in the **user's own browser session**, with **human
approval on every publish**. The official API path (Pages, Instagram, Lead Ads,
Analytics) is unchanged and separate.

## Pairing flow

```
ZONO web app (authenticated user)
  └─ POST /api/extension/facebook/pairing/start
       → creates a hashed, 10-min, one-time pairing code bound to org_id+user_id
       → returns the raw code to display in the UI
Extension (popup)
  └─ POST /api/extension/facebook/pairing/complete { code, version }
       → verifies code (unused + unexpired), creates an instance,
         returns { instanceId, secret } ONCE (secret stored hashed),
         marks chrome_extension path 'installed', consumes the code
Extension (background, periodic)
  └─ POST /api/extension/facebook/heartbeat { version, facebookSessionDetected, profileName? }
       → updates instance + chrome_extension path → installed | ready
```

## Auth model

- The extension authenticates every request with `x-zono-instance-id` +
  `x-zono-extension-secret` headers.
- The server stores only `secret_hash = sha256(secret)`; the raw secret is
  returned exactly once at pairing-complete and never persisted server-side.
- `authInstance()` does a constant-time hash comparison and rejects revoked
  instances.

## Data model

- `facebook_extension_pairings` — `code_hash`, `expires_at`, `used_at` (one-time).
- `facebook_extension_instances` — `instance_id`, `secret_hash`, `org_id`,
  `user_id`, `status`, `version`, `last_seen_at`, `metadata` (non-sensitive only).
- `facebook_connection_paths` (path_type `chrome_extension`) — umbrella status
  (`not_installed | installed | facebook_session_detected | ready | error`).
- Prepared posts come from the existing `distribution_posts` queue; results write
  back to it.

## Message flow

```
content.js (facebook.com)  --HEARTBEAT(sessionDetected,bool)-->  background.js  -->  /heartbeat
popup.js                   --PAIR(code)-->                        background.js  -->  /pairing/complete
popup.js                   --NEXT_POST-->                         background.js  -->  /next-post
popup.js                   --REPORT(result)-->                    background.js  -->  /publish-result
```

`GET /next-post` returns: internal post id, destination name/url, text, image
URLs, hashtags, compliance warnings, `requiresHumanConfirm:true`. **No tokens, no
unrelated user data.**

`POST /publish-result` maps the human-confirmed outcome to the queue:
`user_confirmed_published → published`, `user_cancelled → cancelled`,
`failed → failed`, `needs_manual_action → queued`. A post becomes **published only
on `user_confirmed_published`** — never faked.

## Security guarantees

- ZONO never reads, receives, or stores Facebook **cookies**, **passwords**, or
  **session tokens**. The content script checks logged-in DOM markers only and
  sends a single boolean.
- Extension secrets and pairing codes are stored **hashed** (sha256), never raw.
- All server writes use the service-role client **after** the relevant auth check
  (ZONO session for pairing-start; instance secret for the rest); reads are RLS
  same-org.
- No server-side browser automation, no scraping, no hidden posting.
- The user approves every publish. The extension can be **revoked/disabled from
  ZONO** (`revokeExtensionAction` → all instances `revoked`, path reset).

## What the extension does today

- Pair with ZONO via a one-time code.
- Detect (cookie-free) whether a Facebook session is present in the browser.
- Heartbeat status/version to ZONO.
- Fetch the next prepared Group/Marketplace post.
- Let the user copy the text, open the destination, publish **by hand**, and
  report the result.

## Intentionally NOT built yet

- DOM auto-click publishing / any automated posting.
- Full Chrome Web Store release packaging.
- Facebook Groups discovery automation, scraping, or analytics.
- WhatsApp (separate track) and Marketplace catalog automation.

## Future publishing-automation roadmap (non-binding)

1. Assisted compose: pre-fill the Facebook composer fields (still user-clicks
   "Post").
2. Per-group rotation + pacing guidance surfaced in the popup.
3. Result capture: best-effort external post URL when the user shares it.
4. Optional, policy-reviewed semi-automation — only if compliant with Meta terms
   and with explicit per-action user consent.

---

## Phase 21 — Group Publishing MVP

### MVP flow
```
ZONO: add Facebook group(s) manually (name + URL + notes)
  → select groups + write post text → "שלח לתוסף"
     → one prepared distribution_posts row per group (status=scheduled,
       metadata.channel_kind=facebook_group, destination_name/url) — NO server publish
Extension popup: GET /next-post → shows group name, URL, text, image
  → user: Open group / Open image / Copy text  (sends opened/copied events)
  → user publishes BY HAND on Facebook
  → user: "פרסמתי ✓" (optional URL) / "נכשל" / "דלג"
     → POST /publish-result → ZONO marks published / failed / cancelled
ZONO: per-group status (ממתין → נפתח → הועתק → פורסם/נכשל/דולג) with timestamps
```

### What is manual (assisted, not automated)
- The user opens the group, copies the text, pastes it into Facebook, and clicks
  Post themselves. ZONO never fills the Facebook form or clicks Post.
- The user explicitly reports the outcome; `published` is set ONLY on the user's
  confirmation.

### What is NOT automated (intentionally)
- No DOM auto-fill of the Facebook composer.
- No auto-click "Post". No background/hidden posting.
- No automatic group discovery (groups are added by hand).
- No hard rate enforcement — only a soft recommended delay + warning.

### Safety guarantees (MVP)
- No Facebook cookies/passwords/session tokens read, stored, or transmitted.
- Group/marketplace destinations store only name + URL + notes (no credentials).
- Compliance banner shown; recommended 60–90s delay between groups.
- Every publish requires explicit human confirmation; no fake success.

### API endpoints (Phase 21)
- `GET /api/extension/facebook/next-post` (group/marketplace posts)
- `POST /api/extension/facebook/event` `{postId, event: opened|copied}` (assistive, non-publish)
- `POST /api/extension/facebook/publish-result` `{postId, result, externalPostUrl?, errorMessage?}`
  results: `user_confirmed_published | user_cancelled | failed | needs_manual_action | user_skipped`

### Phase 22 plan (future, not built)
Assisted auto-fill of the composer (text + image attach) while still requiring the
user to click Post; per-group pacing scheduler; optional result-URL capture from
the active tab — all gated on Meta-policy review and explicit per-action consent.
