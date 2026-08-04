# Playwright Runtime — Booting the Test-Runtime App

## Config
`playwright.creative-lab.config.ts` boots the **real** Next.js app with the
guarded test runtime and runs the browser suite against it — **no Supabase, no
OpenAI, no Docker**.

- `testDir: ./e2e/creative-lab`
- `webServer.command: npx next dev -p 3123`
- `webServer.url: http://127.0.0.1:3123/creative-lab` (readiness gate)
- `webServer.env: { ZONO_CREATIVE_TEST_RUNTIME: "true", NODE_ENV: "development" }`
- Supabase / OpenAI / publishing env are **deliberately unset** — their absence is
  exactly what the runtime guard requires.
- `workers: 1`, `fullyParallel: false` — the lab runtime is a single in-memory
  world, so tests run sequentially and deterministically.
- Chromium: the sandbox's preinstalled binary (`PW_CHROMIUM` /
  `/opt/pw-browsers/...`), no `playwright install` download.

## Runner script
`scripts/creative-lab-e2e.sh`:
- refuses to run if any production/provider env (`OPENAI_API_KEY`,
  `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`) is present;
- exports `ZONO_CREATIVE_TEST_RUNTIME=true`, unsets guard-tripping vars;
- runs `npx playwright test --config=playwright.creative-lab.config.ts`.

## Test "login"
Navigating to `/creative-lab/session?as=<token>` sets the session cookie
(`alpha-owner | alpha-agent | alpha-inactive | beta-owner | anonymous`) and
redirects to the workspace — deterministic auth with no identity provider.

## Modes
- **Test mode** (this config): in-memory store + mock providers + local storage.
- **Supabase integration mode** (external): point the server context at a local
  Supabase stack (`supabase start`, Docker) and set the P0 env; the same adapters
  (`DbOrchestrationStore` real client, `SupabasePrivateStorage`) then run against
  real Postgres/Storage. This is the only step that needs Docker/credentials.
