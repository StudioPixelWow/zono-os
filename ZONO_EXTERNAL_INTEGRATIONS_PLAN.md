# ZONO_EXTERNAL_INTEGRATIONS_PLAN

_Phase 15 · Master plan for real external integrations. **Planning only — nothing built, nothing faked, no Meta policy bypassed, no Facebook scraping.**_

## Ground truth (verified in code)

- **Provider abstraction exists and is honest.** `src/lib/distribution/distribution-provider.ts` + registry; `facebook-provider.ts`, `instagram-provider.ts`, `whatsapp-provider.ts` are **safe stubs** — `validateConnection()` returns `not_connected`, `publishPost()` returns `manual_publish_required` (never fakes success), `preparePost()` builds the real manual-publish package.
- **Connection state table exists:** `distribution_provider_connections` (cols: `org_id, provider, status, connection_mode, access_token_encrypted, …`, unique `(org_id, provider)`, RLS-scoped). `access_token_encrypted` is NULL until a real API connection exists.
- **WhatsApp OS** (`src/lib/whatsapp/*`) is a manual assistant (intent/qualification/draft-approve), no Meta send.
- **Apify is the one live external integration pattern** (transactions/external-listings) — token-gated, isolated, dev-mock fallback.
- **No webhook endpoints exist.** `src/app/api` has only cron + external-listings routes. **Zero** OAuth callbacks or Meta/WhatsApp webhooks.
- **Env vars referenced but NOT wired to providers:** `META_ACCESS_TOKEN`, `META_APP_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` appear only in `env-validation.ts` (detection). `OPENAI_API_KEY`, `GEMINI_API_KEY`, `APIFY_TOKEN` are wired.

**Strategic reality:** all Meta-family integrations (1–8) are governed by Meta App Review + business verification. They share one prerequisite: **a verified Meta Business app with the right permissions and a public HTTPS webhook + privacy policy + terms URL.** This is a weeks-long external-approval gate, not a coding gate. Plan accordingly.

---

## Shared prerequisites (block all Meta integrations 1–8)

- Meta Business Manager + **Business Verification** (legal docs).
- A Meta App (Live mode) with **App Review** for each permission set.
- Public **HTTPS webhook** endpoint(s) with verify-token handshake + signed-payload (`X-Hub-Signature-256`) validation.
- Hosted **Privacy Policy** + **Terms** + **Data Deletion** URLs.
- Token storage: encrypt into `access_token_encrypted` (add KMS/`pgcrypto`); long-lived/system-user tokens + refresh handling.
- New shared env: `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`.

---

## 1. WhatsApp Business API (Cloud API)
- **Current status:** STUB — manual assistant only.
- **Existing code/tables:** `src/lib/whatsapp/*`, `whatsapp-provider.ts`, `distribution_provider_connections` (provider=`whatsapp`), WhatsApp OS tables.
- **Missing credentials:** WhatsApp Business Account (WABA), Phone Number ID, system-user permanent token, App Secret.
- **Missing OAuth:** Embedded Signup flow (Meta-hosted) to onboard a WABA.
- **Missing DB:** `wa_phone_number_id`, `waba_id`, `webhook_secret` columns on connections; `whatsapp_messages` (inbound/outbound log) + `message_status` table; template registry table.
- **Missing webhooks:** `POST/GET /api/webhooks/whatsapp` (verify-token + inbound messages + delivery/read statuses).
- **Env:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
- **Meta policy limits:** 24-hour customer-service window; outside it only **pre-approved message templates**; opt-in required; per-number messaging tiers/rate limits; no bulk/cold spam.
- **Can automate:** inbound capture → ZONO lead, delivery/read status, template sends inside the 24h window or via approved templates, AI-drafted replies (human-approved).
- **Must remain manual:** initial opt-in collection; anything outside policy; cold outreach.
- **Priority:** **P0** (Israel runs on WhatsApp — highest commercial value).
- **Complexity:** **High** (Embedded Signup + templates + webhook + token mgmt).

## 2. Meta / Facebook OAuth (foundation for 3–8)
- **Current status:** Missing.
- **Existing:** connection table + manual `connection_mode`.
- **Missing credentials:** Meta App (App ID/Secret), configured redirect URIs.
- **Missing OAuth:** full Facebook Login (`/dialog/oauth` → code → token exchange → long-lived token → system-user token), scope consent, state/CSRF.
- **Missing DB:** `external_account_id`, `token_expires_at`, `scopes`, `webhook_secret` on connections; encrypt `access_token_encrypted`.
- **Missing webhooks:** `GET/POST /api/oauth/meta/callback`.
- **Env:** the shared `META_*` set above.
- **Policy limits:** App Review per scope; business verification; tokens expire/refresh.
- **Can automate:** the whole connect handshake + token refresh.
- **Must remain manual:** the user clicking "Connect" + Meta consent screen.
- **Priority:** **P0** (unblocks 3–8).
- **Complexity:** **Medium**.

## 3. Facebook Pages (publish)
- **Current status:** STUB (`facebook-provider.ts`, kinds include `facebook_page`).
- **Existing:** provider + `distribution_groups`/posts tables + manual prepare/publish.
- **Missing credentials:** Page access tokens (via #2), `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`.
- **Missing OAuth:** page selection after Meta login (list + pick pages).
- **Missing DB:** `connected_pages` table (page_id, name, token); link posts → page_id.
- **Missing webhooks:** Page webhook (feed/comments) — see #7.
- **Env:** shared `META_*` + permissions.
- **Policy limits:** App Review for `pages_manage_posts`; only Pages the user admins.
- **Can automate:** publish text+image to owned Pages, schedule, read post insights.
- **Must remain manual:** nothing once approved (Pages is the cleanest Meta automation).
- **Priority:** **P1** (real, compliant publishing — best first "auto-publish" win).
- **Complexity:** **Medium**.

## 4. Facebook Groups
- **Current status:** STUB; **manual by design** today.
- **Existing:** `distribution_groups` + manual publish assistant.
- **Critical policy limit:** Meta **deprecated the Groups API publishing permissions** (`publish_to_groups` and the Groups API were sunset in 2024). **There is no compliant programmatic way to auto-post to Facebook Groups.** Scraping is prohibited (and a ZONO rule).
- **Missing:** N/A — cannot be built compliantly.
- **Can automate:** nothing (posting). ZONO can still **prepare** the copy-ready package + track which group the agent posted to (current manual flow).
- **Must remain manual:** **all group posting — permanently, until/unless Meta reintroduces an API.**
- **Priority:** **P2 / Won't-do (auto)** — keep the honest manual assistant; do **not** promise automation.
- **Complexity:** N/A (policy-blocked).

## 5. Instagram (Business/Creator publishing)
- **Current status:** STUB (`instagram-provider.ts`).
- **Existing:** provider + connection row (provider=`instagram`).
- **Missing credentials:** IG Business account linked to a FB Page; `instagram_content_publish`, `instagram_basic`; via #2.
- **Missing OAuth:** IG-via-Facebook-Login + page/IG-account selection.
- **Missing DB:** `connected_ig_accounts` (ig_user_id, linked page_id, token).
- **Missing webhooks:** IG comments webhook (optional, see #7).
- **Env:** shared `META_*`.
- **Policy limits:** Content Publishing API: image must be a **public URL** (ZONO has public `zono-marketing-assets` bucket ✓), rate caps (~25 posts/24h), business/creator accounts only, no Stories via API for most apps.
- **Can automate:** publish single image + caption to IG feed; read media insights.
- **Must remain manual:** Stories/Reels (largely), carousels need extra steps.
- **Priority:** **P1** (pairs with Pages).
- **Complexity:** **Medium**.

## 6. Facebook Lead Ads
- **Current status:** Missing (not stubbed).
- **Existing:** ZONO has a lead model (`social_leads`, buyers) to receive into.
- **Missing credentials:** `leads_retrieval`, `ads_management`/Page subscription; via #2.
- **Missing OAuth:** Page connect + subscribe app to the Page's `leadgen` field.
- **Missing DB:** `lead_ad_forms` (form_id, page_id mapping) + ingestion log; map → `social_leads`/buyers.
- **Missing webhooks:** `POST /api/webhooks/meta/leadgen` (real-time leadgen events → fetch lead by id → create ZONO lead).
- **Env:** shared `META_*`.
- **Policy limits:** App Review for `leads_retrieval`; must fetch within token validity; PII handling/consent.
- **Can automate:** instant lead → ZONO buyer/lead + routing + notification. **High ROI, fully compliant.**
- **Must remain manual:** ad creation itself (or later via Marketing API — separate scope).
- **Priority:** **P1** (clean, valuable, real-time leads).
- **Complexity:** **Medium**.

## 7. Facebook comments → ZONO leads
- **Current status:** Manual classifier exists (`distribution-comment-service` + pure classifier) — but **no live comment ingestion**.
- **Existing:** comment analysis tables + Hebrew classifier + safe reply suggestions.
- **Missing credentials:** Page webhook subscription (`feed`/`comments`), `pages_read_engagement`, `pages_manage_engagement` (to reply).
- **Missing OAuth:** via #2/#3 (Page connect).
- **Missing DB:** `page_comments` ingestion table linking to existing classifier; comment→lead link.
- **Missing webhooks:** `POST /api/webhooks/meta/page` (feed/comment changes) → classify → optional ZONO lead.
- **Env:** shared `META_*`.
- **Policy limits:** Page webhooks only for owned Pages; replying needs `pages_manage_engagement` (App Review); no auto-spam.
- **Can automate:** ingest comments on ZONO-published Page posts → classify → create lead; **human-approved** reply send.
- **Must remain manual:** reply approval; Groups comments (policy-blocked, #4).
- **Priority:** **P2** (depends on #3 Pages being live first).
- **Complexity:** **Medium**.

## 8. Meta analytics (impressions/clicks/CTR)
- **Current status:** STUB — UI gated behind connection (Phase 6 "ממתין ל-Meta"); `distribution_analytics` table exists, no writer.
- **Existing:** analytics table + repository + gated Overview tiles.
- **Missing credentials:** `read_insights` / page+IG insights via #2/#3/#5.
- **Missing OAuth:** none beyond #2/#3.
- **Missing DB:** none (table exists) — add a scheduled writer + `source='meta'` provenance.
- **Missing webhooks:** none — pull via Insights API on schedule.
- **Env:** shared `META_*`.
- **Policy limits:** insights only for owned Pages/IG/posts published via API; metric availability windows.
- **Can automate:** nightly pull of post/page insights → `distribution_analytics` → un-gate the real tiles.
- **Must remain manual:** nothing.
- **Priority:** **P2** (only meaningful after #3/#5 publish real posts).
- **Complexity:** **Low–Medium** (a cron writer once auth exists).

## 9. OpenAI / Gemini image generation
- **Current status:** **Wired with graceful fallback** — provider selector defaults to mock when no key (`creative-studio/providers/*`, `visual-providers/*`); outputs prompt + render object without a key.
- **Existing:** full provider layer, model env, QA pipeline.
- **Missing credentials:** a real `OPENAI_API_KEY` or `GEMINI_API_KEY` + image model config in prod.
- **Missing OAuth:** none (API key).
- **Missing DB:** none (`final_image_url` column ready).
- **Missing webhooks:** none.
- **Env:** `OPENAI_API_KEY` / `GEMINI_API_KEY`, `ZONO_IMAGE_PROVIDER`/`VISUAL_PROVIDER`, model envs (already read).
- **Policy limits:** provider content policy + cost; rate limits.
- **Can automate:** real final-image generation end-to-end (already built behind the key).
- **Must remain manual:** nothing.
- **Priority:** **P0** (cheapest, highest-visibility "wow" — just add a key + flip default).
- **Complexity:** **Low** (config, not build).

## 10. Apify market data
- **Current status:** **LIVE pattern, token-gated.** Yad2/Madlan/GovMap providers + sync services + cron (transactions-refresh now scheduled).
- **Existing:** `transactions/providers.ts`, `external-listings/providers.ts`, import API routes, crons.
- **Missing credentials:** prod `APIFY_TOKEN` (+ optional actor-id overrides).
- **Missing OAuth:** none (token).
- **Missing DB:** none.
- **Missing webhooks:** none (pull/cron).
- **Env:** `APIFY_TOKEN`, `APIFY_YAD2_ACTOR_ID`, `APIFY_MADLAN_ACTOR_ID`, `APIFY_MADLAN_ANALYTICS_ACTOR_ID`, `APIFY_GOVMAP_TRANSACTIONS_ACTOR_ID`.
- **Policy/legal limits:** respect source sites' ToS; Apify actor maintenance risk; rate/cost caps (guardrails exist).
- **Can automate:** scheduled market/transaction/listing sync (already isolated + cursor-resumable).
- **Must remain manual:** nothing (admin "Sync Now" also available).
- **Priority:** **P1** (turns "empty" market/acquisition pages into live data).
- **Complexity:** **Low** (mostly config; code exists).

## 11. E-signature provider
- **Current status:** Missing real provider — documents/legal use **manual sign-lock** (status flips, doc locks).
- **Existing:** documents + legal signature tables, signature_status lifecycle, audit log.
- **Missing credentials:** a provider account (e.g. DocuSign / Dropbox Sign / a local Israeli e-sign vendor).
- **Missing OAuth:** provider OAuth/API-key + sender identity.
- **Missing DB:** `esign_envelopes` (provider, envelope_id, status, signer mapping) linked to `legal_documents`/`documents`.
- **Missing webhooks:** `POST /api/webhooks/esign` (envelope status: sent/viewed/signed/declined → update doc + audit).
- **Env:** `ESIGN_PROVIDER`, `ESIGN_API_KEY`/OAuth, `ESIGN_WEBHOOK_SECRET`.
- **Policy/legal limits:** **legal review required** (Israeli e-signature law / חוק חתימה אלקטרונית); identity verification; consent + retention.
- **Can automate:** send envelope, track status, lock on completion, store signed PDF.
- **Must remain manual:** legal/compliance sign-off on the chosen vendor and flow.
- **Priority:** **P2** (closing trust; needs legal review — don't rush).
- **Complexity:** **Medium** + legal.

## 12. Communication inbox integrations (email/SMS/unified)
- **Current status:** Manual logging only (`/communication` — entries entered by hand; comm-intelligence tables real).
- **Existing:** communication + comm-intelligence tables, classifier, timeline.
- **Missing credentials:** depends on channel — email (Gmail/Microsoft Graph OAuth or IMAP), SMS (Twilio/local Israeli SMS), or a unified inbox provider.
- **Missing OAuth:** per-channel (Google/Microsoft OAuth) or API key (Twilio).
- **Missing DB:** `inbox_accounts` (channel, provider, token) + `inbox_messages` ingestion linked to entities + the comm-intelligence pipeline.
- **Missing webhooks:** `POST /api/webhooks/email`, `POST /api/webhooks/sms` (inbound) per provider.
- **Env:** per provider (`GMAIL_*`/`MS_GRAPH_*`, `TWILIO_*`, etc.).
- **Policy limits:** Google/Microsoft security review for mail scopes; SMS sender registration; consent.
- **Can automate:** inbound capture → classify → attach to buyer/seller/deal + suggested reply (human-approved).
- **Must remain manual:** reply approval; sensitive-data handling.
- **Priority:** **P2** (broad, channel-by-channel; start with one channel).
- **Complexity:** **High** (multi-provider, OAuth security review).

---

## Priority rollup

| # | Integration | Priority | Complexity | Gating factor |
|---|---|---|---|---|
| 9 | Image generation (OpenAI/Gemini) | **P0** | Low | Just a key + flip default |
| 1 | WhatsApp Business API | **P0** | High | Meta approval + Embedded Signup |
| 2 | Meta OAuth foundation | **P0** | Medium | Meta app + business verification |
| 10 | Apify market data | **P1** | Low | Prod token |
| 3 | Facebook Pages publish | **P1** | Medium | #2 + App Review |
| 5 | Instagram publish | **P1** | Medium | #2 + IG business acct |
| 6 | FB Lead Ads | **P1** | Medium | #2 + `leads_retrieval` review |
| 8 | Meta analytics | **P2** | Low–Med | #3/#5 live first |
| 7 | FB comments → leads | **P2** | Medium | #3 live first |
| 11 | E-signature | **P2** | Med + legal | Vendor + legal review |
| 12 | Comms inbox | **P2** | High | Per-channel OAuth review |
| 4 | Facebook Groups (auto) | **Won't-do** | N/A | **Meta API deprecated — manual only** |

## Recommended sequencing (the honest path)
1. **Week 0 (no approval needed):** light up **#9 image-gen** (key) and **#10 Apify** (token). Immediate product lift, zero Meta dependency.
2. **Start the long pole now:** file **Meta business verification + App Review** for **#2 → #1 WhatsApp** (longest external lead time).
3. **After #2 approved:** **#3 Pages + #5 Instagram + #6 Lead Ads** (the compliant Meta publishing + leads core).
4. **Then:** **#8 analytics** (un-gate the real tiles) and **#7 comments→leads**.
5. **Parallel, legal-led:** **#11 e-sign** vendor selection + review; **#12 inbox** one channel at a time.
6. **Never:** automated Facebook **Groups** posting or any scraping — keep the honest manual assistant.

**Bottom line:** two integrations (image-gen, Apify) are config-only and can ship this week. Everything Meta shares one multi-week approval gate that should be started immediately but not promised as "done." Facebook Groups automation is permanently off the table by Meta policy — ZONO's manual group assistant is the correct, compliant answer.
