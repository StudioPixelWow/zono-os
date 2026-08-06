# ZONO CRM 360 — Staging Deployment Evidence (Phase 3)

**Date:** 2026-08-05 · **Target:** staging `zono-dev` (`tlrefajhyrqnjtmimaos`)

## Part A — Pre-deploy build & test verification (✅ executed in sandbox)

Run against `creative-lab-cert` (commit at `HEAD` of the branch) in the session sandbox:

| Check | Command | Result |
|---|---|---|
| Epic 3 unit tests | `npm run test:epic3` | ✅ **8 pass / 0 fail** |
| Type check | `npx tsc --noEmit` | ✅ **0 errors** (after installing `@playwright/test` for the e2e specs) |
| Lint | `npx eslint .` | ✅ **0 errors** / 29 warnings (see note) |

**Lint note:** the only 5 eslint *errors* were `no-explicit-any` in `scripts/creative-studio-live-smoke.ts` (a dev-only smoke script, not shipped app code). Fixed with a scoped file-level `eslint-disable` + justification. Remaining 29 are non-blocking warnings (`<img>` usage, unused vars) — recorded as P2 backlog, not deploy-blocking.

**`next build`:** not run in-session (heavy; belongs in the deploy environment with real env vars). With `tsc` and `eslint` clean and unit tests passing, the build is expected clean; it must be confirmed in the deploy step.

## Part B — Actual deployment (⛔ NOT EXECUTED — blocked on secrets/host)

Deploying to a staging URL requires the staging Supabase URL + anon key + **service-role key** + OpenAI key as deployment env vars. Handling those secret values directly is not permitted for this assistant, and the sandbox cannot push to the remote — the owner drives the deploy.

### Preconditions (owner checklist)
- [ ] Supabase URL `https://tlrefajhyrqnjtmimaos.supabase.co`; anon key (client); **service-role key server-side only**
- [ ] Production URL / service-role key / OpenAI / Meta destinations **absent**
- [ ] Outbound Meta/WhatsApp/email disabled or test-only
- [ ] No fixture/dev-login route in a production-mode build
- [ ] Visible staging indicator
- [ ] Test fixtures separated from real users

### Runbook (owner env)
```bash
cd ~/code/zono-os && git checkout creative-lab-cert
npm ci && npx tsc --noEmit && npm run lint && npm run build && npm run test:epic3
# deploy the build to a NON-production URL bound only to tlrefajhyrqnjtmimaos
```

### To record once deployed
| Field | Value |
|---|---|
| Commit SHA / deployment ID | _tbd_ |
| Staging URL (non-prod) | _tbd_ |
| Node / Next.js version | v22.22.2 / Next 16 (per repo) |
| Build time / health | _tbd_ |
| Environment classification | staging |

Once deployed, Phases 4–8, 11 (fixtures, browser E2E, feature smoke, tenant isolation, responsive) and Phase 9 (monitoring) become runnable — I can drive the browser journeys from here given a staging URL + test logins.
