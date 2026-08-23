# Buyer Portal Consolidation — Buyer Command Center 5.1

**CANONICAL_PORTAL = `/my/[token]`**
The persistent, revocable, per-buyer HMAC portal (`src/app/my/[token]/page.tsx` + `src/lib/customer-portal/*`). It is the ONE buyer experience: office-branded, RTL, mobile-first, privacy-boundaried DTO (`BuyerPortalData` — no sellers, other buyers, CRM notes, scores, or deal-admin state), a single feedback writer (`applyRecommendationFeedback`), and now a tracked property-view hop (`/api/my/[token]/view/[propertyId]` → public `/p/[id]`). Sent via `sendShortlistPortal` — the same persistent link every time (never a new link per send).

**LEGACY_PORTAL = `/r/[token]`** (per-send match-bundle view) and **`/buyer-portal/*`** (separate authenticated buyer dashboard app, `@/lib/buyer-portal`).

**REDIRECT_STRATEGY**
- `/r/[token]` is retained as the tracked per-recipient outreach wrapper around the public property page, but it has **no divergent business behavior**: its feedback POST (`/api/r/[token]/feedback`) calls the exact same `applyRecommendationFeedback` writer as `/my`. It is compatibility-only, not a second product.
- `/buyer-portal/*` is an authenticated (email-login) dashboard with its own backend. It is **flagged for retirement** in favour of the token portal; it is not the canonical experience and no 5.1 surface links to it. Full removal is deferred (P2) to avoid regressing existing authenticated sessions.

**COMPATIBILITY_STRATEGY**
- One feedback engine (`applyRecommendationFeedback`) backs both `/my` and `/r` — buyer actions produce identical CRM state (recommendation ledger + shortlist mirror + interest edge + broker timeline + owner notification) regardless of which link was opened.
- One persistent link per buyer: `getPortalLink` / `sendShortlistPortal` reuse the same `/my` URL across sends; updating the shortlist updates the content behind the same URL. Revocation bumps `buyers.preferences.portal_token_version`, versioning the token without changing the URL scheme.

**Net:** exactly one canonical buyer product experience (`/my`), one feedback truth, one persistent link. The legacy routes either share that truth (`/r`) or are quarantined for retirement (`/buyer-portal`).
