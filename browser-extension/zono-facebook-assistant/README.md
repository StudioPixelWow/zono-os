# ZONO Facebook Assistant (browser extension)

Browser‑assisted helper that connects a user's Facebook to ZONO. It imports the
groups the user is a member of, shows prepared posts for manual publishing, and
captures comments on the user's ZONO posts — **all talking only to ZONO's
canonical extension APIs**. It never reads Facebook cookies/passwords/tokens and
never auto‑publishes; every publish is human‑confirmed.

## What it does (v0.2)

- **Pairing** — exchanges a one‑time code from ZONO (Settings → Distribution
  Connections) for an instance id + secret, stored locally.
- **Heartbeat** — reports `facebookSessionDetected` (boolean) + version. Reads
  back `scanRequested` so a ZONO "Import my groups" click triggers a scan.
- **Group import (P4)** — on a scan request (or the popup's "Import my groups"),
  opens the user's joined‑groups page, lazy‑loads it, reads `{externalGroupId,
  name, url, membersCount?, privacyLevel?, memberRole?, isMember}` and POSTs to
  `/api/extension/facebook/groups`. Values that can't be determined reliably are
  sent as `null` — never guessed.
- **Prepared post (P0)** — fetches the next prepared post from
  `/api/extension/facebook/next-post`; the user copies the text, opens the group,
  publishes **by hand**, then confirms (optionally pasting the post URL). The
  result goes to `/api/extension/facebook/publish-result`. Nothing is marked
  published without the user's confirmation; the server enforces pause / emergency
  stop / lost‑ack / de‑dup.
- **Comment ingest (P5)** — on the permalink of a post ZONO published (tracked
  after a confirmed publish with a URL), reads new comments and POSTs to
  `/api/extension/facebook/comments`.

## Install (unpacked, for testing)

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder (`browser-extension/zono-facebook-assistant`).
3. Open the extension popup → confirm the **ZONO address** (default is the
   official environment) → **Save**.

## Connect + import (the human steps)

1. In ZONO: **Settings → Distribution Connections** → start extension pairing →
   copy the `ZONO‑XXXX‑XXXX` code.
2. In the extension popup: paste the code → **חבר (Connect)**.
3. Make sure you're **logged into Facebook** in the same browser.
4. Click **ייבא את הקבוצות שלי (Import my groups)** (or click "Import my groups"
   in ZONO). The joined‑groups page opens and is scanned; your groups appear in
   ZONO under Distribution → Groups.

## Publish (controlled test)

1. Prepare a campaign/post in ZONO for a **test group you own**.
2. Open the popup → the prepared post appears → **Copy text** → **Open group** →
   publish by hand → paste the post URL → **פרסמתי ✓ (Published)**.
3. ZONO records the confirmed publish + URL and starts watching that post for
   comments.

## Security

- No Facebook cookies, passwords, or session tokens are ever read or sent.
- Only metadata the logged‑in user can already see is read, and only on the
  user's explicit import.
- No server‑side browser automation; no auto‑clicking a publish.

## Notes / tuning

Facebook's DOM is obfuscated and changes frequently. The readers use stable
anchors (`/groups/<id>` hrefs, comment permalinks) with best‑effort text parsing
and graceful degradation. The `content.js` selector blocks (`collectGroups`,
`collectComments`) may need light tuning against the current Facebook UI; when a
value can't be read reliably it is sent as `null` rather than guessed.

Set a different ZONO origin in the popup if you deploy on a custom domain (also
add that origin to `host_permissions` in `manifest.json`).
