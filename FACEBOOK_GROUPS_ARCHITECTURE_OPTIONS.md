# FACEBOOK_GROUPS_ARCHITECTURE_OPTIONS

_Architecture research only. No code changed. Per instruction: this is a neutral architectural survey — it does **not** assert what Meta currently does or does not permit; it maps the technically-possible publishing topologies and scores each on the requested dimensions. Policy/legal review is a separate gate and is flagged where relevant._

## Where any of these would plug into ZONO

ZONO already has the right seam: a single `DistributionProvider` contract (`src/lib/distribution/distribution-provider.ts`) with `preparePost()` (pure, copy-ready package — always works) and `publishPost()` (today a safe stub returning `manual_publish_required`). `distribution_groups` stores the agent's groups; `distribution_provider_connections` stores per-org connection state; the Publish Assistant UI consumes `PreparedPost` + `COMPLIANCE_WARNINGS`. **Every architecture below is a swap-in implementation of `publishPost()` / a new "publish channel" behind that same interface** — nothing upstream (campaigns, scheduling, copy, creatives, lead tracking) changes. That is the key architectural fact: ZONO is publish-mechanism-agnostic by design.

Scoring legend: **scalability**, **maintenance**, **account risk** (to the agent's FB account), **policy risk** (ToS/platform-rule exposure), **UX**, **implementation complexity** — each Low / Medium / High.

---

## 1. Official Meta APIs (Graph API path)
**Topology:** ZONO server → OAuth-obtained token → official Graph endpoint → group. Pure server-to-server; no browser, no session replay.
- **Scalability:** High — server-side, multi-tenant, rate-limited by the platform, horizontally scalable.
- **Maintenance:** Low–Medium — versioned API, SDKs; breakage only on API version bumps.
- **Account risk:** Lowest — sanctioned path; the account is never "driven."
- **Policy risk:** Lowest *by construction* — you operate inside whatever the API grant allows (subject to App Review + the current permission catalog, which must be verified at build time, not assumed here).
- **UX:** Best — true one-click "publish from ZONO," real post IDs, real status/analytics callbacks.
- **Complexity:** Medium — OAuth + token storage/refresh + webhook + App Review.
- **Fit:** Cleanest if/when the required group-publishing grant is available. Plugs directly into `publishPost()` + `validateConnection()`.

## 2. Browser automation (headless, ZONO-hosted)
**Topology:** ZONO-controlled headless browser (Playwright/Puppeteer) logs in as the agent and drives the FB UI to post.
- **Scalability:** Low–Medium — one heavy browser context per account; CPU/RAM intensive; IP/fingerprint management needed; brittle under UI changes.
- **Maintenance:** High — UI selectors/flows change frequently; constant repair; anti-bot countermeasures.
- **Account risk:** High — server-side login + automated UI actions are the classic trigger for checkpoints/locks/bans on the agent's account.
- **Policy risk:** High — automating a human session from a datacenter typically conflicts with platform automation/ToS rules. **Requires explicit legal/policy review; do not ship without it.**
- **UX:** Good *when it works* (looks like one-click), poor when it breaks (silent failures, lockouts).
- **Complexity:** High — login, 2FA handling, captcha, proxy/fingerprint, session storage, headless infra.
- **Fit:** Technically possible, highest combined account+policy risk. Not recommended as a hosted server capability.

## 3. Chrome extension (client-side, agent's own browser)
**Topology:** ZONO browser extension runs in the **agent's** logged-in Chrome. ZONO prepares the post; the extension fills/clicks within the agent's real session, on the agent's device, initiated by the agent.
- **Scalability:** High *operationally* — work runs on each user's machine, not ZONO servers; ZONO only serves content + orchestration.
- **Maintenance:** Medium–High — depends on FB DOM stability + Chrome Web Store review cycles + extension-API changes.
- **Account risk:** Medium — it's the agent's own session/device/IP (no remote login), but automated DOM actions still carry some detection risk; lower than #2 because it's first-party + human-initiated.
- **Policy risk:** Medium — "user-initiated assist in the user's own session" is a materially different posture than datacenter automation, but still must be reviewed against platform automation rules and Chrome Web Store policy.
- **UX:** Very good — feels native ("Publish to group" button), no copy-paste, agent stays in control and present.
- **Complexity:** Medium–High — extension build, content scripts, message bus to ZONO, store review, per-browser support.
- **Fit:** The strongest "feels automated, stays first-party" option. Could expose itself to ZONO as a provider whose `publishPost()` dispatches an instruction the extension fulfills, with the human in the loop.

## 4. Human-assisted publishing (current ZONO model)
**Topology:** ZONO assembles the copy-ready `PreparedPost` (text + hashtags + image + checklist); the agent pastes and posts manually; then marks published + pastes the post URL back.
- **Scalability:** High for the *software* (pure server work); throughput is bounded by human time.
- **Maintenance:** Lowest — no FB surface dependency at all; nothing to break when FB changes.
- **Account risk:** Lowest — a human posts in their own session exactly as always.
- **Policy risk:** Lowest — no automation of the platform whatsoever.
- **UX:** Moderate — friction of copy/paste/switch, but predictable and trustworthy; ZONO removes the *thinking* (what to post), leaving only the *doing*.
- **Complexity:** Lowest — already built (`preparePost` + Publish Assistant + checklist).
- **Fit:** The safe floor. Should remain the always-available baseline regardless of which automated option (if any) is added.

## 5. Desktop agent (native helper app on the agent's machine)
**Topology:** A small native app (Electron/Tauri/OS service) on the agent's computer drives a local browser or uses local automation to post in the agent's session; talks to ZONO for content/orchestration.
- **Scalability:** High operationally (runs per-user); ZONO is just the backend.
- **Maintenance:** High — cross-OS packaging, auto-update, native browser driving, plus the same FB-UI fragility as #2/#3.
- **Account risk:** Medium — agent's own device/session, but automated, so non-trivial detection risk.
- **Policy risk:** Medium–High — automation of the session; review required; heavier install also raises user trust/IT friction.
- **UX:** Good once installed; high *install* friction (download, OS permissions, security prompts).
- **Complexity:** High — distribution, signing, auto-update, support matrix.
- **Fit:** Superset of the extension's risk with worse install UX; rarely worth it over #3 unless deep OS integration is needed.

## 6. Session-based automation (stored cookies / token replay, server-side)
**Topology:** Agent's FB session cookies/tokens captured and replayed from ZONO servers to act as them.
- **Scalability:** Medium — lighter than full headless, but per-account session lifecycle, refresh, and IP consistency are hard.
- **Maintenance:** High — sessions expire/rotate; constant re-auth; fragile.
- **Account risk:** Highest — datacenter requests on a session minted on the user's device is a strong anomaly signal → locks/bans.
- **Policy risk:** Highest — credential/session handling off-device generally conflicts with ToS **and** with ZONO's own safety rule ("no password/session sharing; publishing is done by the user"). 
- **UX:** Appears seamless until the account is flagged, then catastrophic.
- **Complexity:** Medium technically, but high security/compliance burden (storing session secrets).
- **Fit:** **Not recommended.** Conflicts with ZONO's existing stated principle of never handling credentials/sessions. Listed for completeness only.

## 7. Hybrid workflows (the realistic strategy)
**Topology:** Combine tiers behind the one provider interface, choosing per-destination/per-policy:
- **API where available** (#1) for Pages/IG and any sanctioned group path → true automation.
- **First-party extension assist** (#3) for the agent's own groups → "feels automated," human-initiated, first-party session.
- **Human-assisted** (#4) as the universal fallback that always works and is always safe.
- ZONO orchestrates: prepare once, then route to the best-available, lowest-risk mechanism the agent has enabled; always degrade gracefully to manual; always log real post URLs back for tracking/analytics.
- **Scalability:** High (each tier scales on its own substrate).
- **Maintenance:** Medium (sum of enabled tiers, but each is isolated behind the interface).
- **Account/policy risk:** Tunable — default to lowest-risk tiers; gate higher-risk tiers behind explicit opt-in + review.
- **UX:** Best overall — one button, mechanism chosen automatically, never a dead end.
- **Complexity:** Medium–High (you build more than one mechanism), but **incremental**: start manual (#4, already done), add API (#1) and/or extension (#3) without touching upstream.
- **Fit:** Recommended architecture. ZONO's `DistributionProvider` seam already makes this a routing decision, not a rewrite.

---

## Comparison matrix

| # | Architecture | Scalability | Maintenance | Account risk | Policy risk | UX | Complexity |
|---|---|---|---|---|---|---|---|
| 1 | Official Meta API | High | Low–Med | Lowest | Lowest | Best | Medium |
| 2 | Hosted browser automation | Low–Med | High | High | High | Mixed | High |
| 3 | Chrome extension (first-party) | High (per-user) | Med–High | Medium | Medium | Very good | Med–High |
| 4 | Human-assisted (current) | High (sw) | Lowest | Lowest | Lowest | Moderate | Lowest |
| 5 | Desktop agent | High (per-user) | High | Medium | Med–High | Good (high install friction) | High |
| 6 | Session/cookie replay | Medium | High | Highest | Highest | Fragile | Med + heavy compliance |
| 7 | Hybrid (API + extension + manual) | High | Medium | Tunable | Tunable | Best | Med–High (incremental) |

## Architectural conclusion

The decisive architectural property is **where the post action executes and whose session it runs in**, which determines account + policy risk far more than implementation effort:

- **Server-side, sanctioned (API, #1):** lowest risk, best UX — the target whenever the grant exists.
- **Client-side, first-party, human-initiated (extension #3, manual #4):** the safe automation-spectrum — the agent's own session/device, ZONO assists rather than impersonates.
- **Server-side impersonation (headless #2, session replay #6):** highest account + policy risk and, in #6's case, in direct conflict with ZONO's existing no-credential-handling principle.

**Recommended target architecture: #7 Hybrid**, built incrementally on the existing `DistributionProvider` seam — keep #4 as the always-safe floor, add #1 where a sanctioned path exists, and treat #3 (first-party extension) as the highest-value "feels-automated" upgrade. Routes #2/#5/#6 are technically possible but should not ship without explicit, written policy/legal review, and #6 should be ruled out on ZONO's own stated safety principle.

_(Reminder: the actual availability of any sanctioned group-publishing API and the precise platform automation rules must be verified against current Meta documentation/policy before committing to #1 or any automation tier — that verification is deliberately out of scope for this architecture-only survey.)_
