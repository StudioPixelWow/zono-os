# OpenAI Live Smoke — Results

## Status: PASSED (real capped calls, staging key)
Executed on a developer machine with a staging `OPENAI_API_KEY` via
`scripts/creative-studio-live-smoke.ts --confirm-staging`: **12 passed, 0 failed**.

## Configuration
- Model: **`gpt-image-2`** (the configured default) — request succeeded; the model
  is stamped on every response. No silent model switching.
- Provider call: direct, dependency-free `fetch` to
  `https://api.openai.com/v1/images/generations`, capped at
  `SMOKE_MAX_REQUESTS` (=4, one per kind) and a spend ceiling; **no secret printed**;
  refuses production.

## Results (one minimal fixture per creative kind)
| Kind | request | model stamped | usage requested→succeeded | image bytes |
|------|:------:|:-------------:|:-------------------------:|------------:|
| property_ad_post | ✓ | gpt-image-2 | ✓ (23.1s) | ~931 KB |
| agent_brand      | ✓ | gpt-image-2 | ✓ (14.1s) | ~844 KB |
| office_brand     | ✓ | gpt-image-2 | ✓ (22.7s) | ~862 KB |
| market_stat      | ✓ | gpt-image-2 | ✓ (31.6s) | ~871 KB |

Every request: provider request succeeded, model stamped, and a usage event
transitioned `requested → succeeded` (recorded before the billable call, updated
after). Real image bytes returned (~0.8–0.9 MB each).

## Notes
- The `OpenAIImageProvider` adapter (`image-provider.ts`) is `server-only` and is
  unit-covered (`visual-gen-extensions.qa.ts` 52/0); this live smoke validates the
  external provider + model + credentials end to end via the same HTTP API.
- Security: the staging key was supplied only in the operator's shell env, never
  committed. (The key used during this session should be rotated, as it was shared
  outside the shell.)

**Result: OpenAI live provider smoke — PASSED (gpt-image-2, 12/12).**
