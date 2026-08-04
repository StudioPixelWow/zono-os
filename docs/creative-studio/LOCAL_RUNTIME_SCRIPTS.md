# Local Runtime Scripts

## scripts/creative-studio-local-runtime.sh
Deterministic, credential-free local provisioner. **Refuses production** (grep guard on DB/project refs incl. the known prod ref). Steps: deps → reset isolated local DB → apply migrations → seed Alpha/Beta fixtures → configure mock image/publishing providers + local private storage → print safe workspace/bulk URLs. Prints no secrets. (App start requires a local Supabase-compatible API — Docker/local stack — which is unavailable in the CI sandbox.)

## scripts/creative-studio-live-smoke.ts
Guarded live smoke (NOT run without creds). Refuses production; requires `--confirm-staging`; caps requests (`SMOKE_MAX_REQUESTS`) and estimated spend (`SMOKE_MAX_SPEND_USD`); prints no secrets; records created staging ids; skips (not fails) when `OPENAI_API_KEY` / storage creds are absent. Tests OpenAI + Supabase storage + publishing adapters only when configured.
