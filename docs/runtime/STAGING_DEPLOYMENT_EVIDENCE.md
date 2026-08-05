# ZONO CRM 360 — Staging Deployment Evidence (Phase 5)

**Status: ⛔ NOT EXECUTED — blocked in this session. Runbook + preconditions below.**
**Date:** 2026-08-05

## Why this is blocked here

This session reaches the staging **database** through the Supabase MCP, but it has no path to stand up a running **application** deployment:

- Deploying `creative-lab-cert` to a staging URL requires the staging Supabase URL + anon key + **service-role key** and the OpenAI key to be configured as deployment env vars. Handling those secret values directly is not permitted for this assistant — the project owner must set them.
- The cloud sandbox cannot push to the git remote (proxy 403); deploys are driven from the owner's environment / Vercel.
- Per the program's own rule, E2E may not be replaced by code inspection — so no "deployed" claim is made without a real deployment.

Because Phases 6–8 and 10 depend on this deployment, they are also open (see their result docs).

## Preconditions to satisfy before deploying (owner checklist)

- [ ] Staging Supabase URL = `https://tlrefajhyrqnjtmimaos.supabase.co` (reconciled project)
- [ ] Staging anon key set (client)
- [ ] Staging **service-role key server-side only** (never shipped to the browser bundle)
- [ ] **Production keys absent** from the staging env
- [ ] Staging OpenAI key explicitly identified (separate from production)
- [ ] Outbound **Meta / WhatsApp / email disabled** or pointed at controlled test destinations
- [ ] No fixture/dev-login route enabled in a production-mode build
- [ ] Environment visibly self-identifies as **staging**
- [ ] Test fixtures separated from real product users

## Build/verify runbook (run in the owner's env, native terminal)

```bash
cd ~/code/zono-os
git checkout creative-lab-cert
npm ci
npx tsc --noEmit
npx eslint .
npm run build
# deploy the production build to a NON-production URL bound only to the staging Supabase project
# record the deployed commit SHA + environment name below
```

## To record once deployed

| Field | Value |
|---|---|
| Deployed commit SHA | _tbd_ |
| Environment URL | _tbd (non-production)_ |
| Supabase project | tlrefajhyrqnjtmimaos (staging) |
| tsc / eslint / build | _tbd_ |
| Health check | _tbd_ |

Once deployed, run Phases 6–8 (browser E2E, feature smoke, tenant isolation) and Phase 10 (monitoring), then update `DESIGN_PARTNER_READINESS_FINAL.md`.
