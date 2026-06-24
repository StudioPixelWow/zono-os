# PRODUCTION_ENV_REPORT

_Phase 10 · Part B — Environment variable audit. Inspection only._
_Source: every `process.env.*` reference in `src/` (verified via grep)._

## Priority key

- **P0** — app cannot boot / core flows fail without it.
- **P1** — a major feature is unavailable, but the app runs and degrades gracefully.
- **P2** — optional tuning / enhancement; safe defaults exist.

## Variable matrix

| Variable | Priority | Required? | Fallback exists? | Affected routes / features |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **P0** | Yes | No | **Everything** — DB/auth client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **P0** | Yes | No | **Everything** — client auth. |
| `SUPABASE_SERVICE_ROLE_KEY` | **P0** | Yes (server) | No | Server actions, cron writes, admin engine recompute (`engine_runs`). |
| `CRON_SECRET` | **P1** | For cron only | Yes — cron self-disables (returns 401) without it | `/api/cron/external-listings-sync`, `/api/cron/transactions-refresh`. Without it, scheduled jobs no-op safely. |
| `APIFY_TOKEN` | **P1** | For live market data | Yes — dev mock (`NODE_ENV!=='production'`); prod isolates & skips, no crash | `/transactions` (+ radar/streets/coverage), `/acquisition`, external-listings sync. **Empty in prod = no live data, route still loads.** |
| `APIFY_YAD2_ACTOR_ID` | **P1** | With Apify | Yes — default actor id | External listings (Yad2). |
| `APIFY_MADLAN_ACTOR_ID` | **P1** | With Apify | Yes — default | External listings (Madlan). |
| `APIFY_MADLAN_ANALYTICS_ACTOR_ID` | **P2** | Optional | Yes | Madlan analytics deals. |
| `APIFY_GOVMAP_TRANSACTIONS_ACTOR_ID` | **P1** | With Apify | Yes — default | GovMap transactions. |
| `OPENAI_API_KEY` | **P1** | Optional | Yes — deterministic fallback everywhere | Creative AI copy/concept/campaign/asset, marketing analysis, neighborhood discovery, property AI, image pipeline. **Without it: deterministic output, no crash.** |
| `GEMINI_API_KEY` | **P1** | Optional | Yes — falls back to OpenAI → mock provider | Creative visual/text providers. |
| `ZONO_IMAGE_PROVIDER` / `VISUAL_PROVIDER` | **P1** | Optional | Yes — defaults to **mock provider** when no key | Creative final-image generation. Without a key → prompt + render object, **no fake image, no crash**. |
| `ZONO_MARKETING_ANALYSIS_PROVIDER` | **P2** | Optional | Yes — auto-detect | Marketing analysis provider selection. |
| `ZONO_NANO_BANANA_MODEL` / `ZONO_GEMINI_IMAGE_MODEL` / `ZONO_GEMINI_MODEL` / `ZONO_OPENAI_IMAGE_MODEL` / `ZONO_OPENAI_MODEL` | **P2** | Optional | Yes — model-name defaults | Creative model selection. |
| `OPENAI_IMAGE_MODEL` / `OPENAI_VISION_MODEL` / `OPENAI_ENRICHMENT_MODEL` | **P2** | Optional | Yes — defaults | OpenAI sub-models. |
| `ZONO_CREATIVE_MAX_ATTEMPTS` / `_TOTAL_BUDGET_MS` / `_IMAGE_TIMEOUT_MS` / `_ATTEMPT_COST_MS` / `_IMAGE_SIZE` | **P2** | Optional | Yes — numeric defaults | Creative generation guardrails (cost/time caps). |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **P2** | Optional | Yes — manual coordinate entry fallback | Property location map in create wizard. Without it → manual lat/long. |
| `NEXT_PUBLIC_COMMIT_SHA` / `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` / `_REF` | **P2** | Optional | Yes | Build/version display only. |
| `NODE_ENV` | **P0** (platform-set) | Set by host | n/a | Gates dev mocks; must be `production` in prod. |

## Findings

1. **Three true P0s** — the Supabase trio. Everything else degrades gracefully. This is a healthy posture for a demo/beta.
2. **No env validation at boot.** There is no central "assert required env present" step; a missing Supabase var fails at first DB call rather than with a clear startup error. **Recommendation (not implemented — out of scope):** add a boot-time check for the 3 P0s.
3. **All AI/image/scraper keys are P1 with real fallbacks** — confirmed in `src/lib/creative-studio/providers/index.ts` (defaults to mock provider) and `src/lib/transactions/providers.ts` (throws only inside the Apify client, callers isolate). No P1 absence crashes a page.
4. **`.env.example` recommendation:** ship a documented example listing all P0/P1 vars so a fresh deploy doesn't miss the Supabase trio or `CRON_SECRET`.

**Minimum viable production env (safe demo):** the 3 Supabase P0s + `CRON_SECRET`. Everything else can be added incrementally to light up live data / AI / images.
