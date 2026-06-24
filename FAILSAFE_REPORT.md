# FAILSAFE_REPORT

_Phase 10 · Part D — Production fail-safe behavior when external providers are unavailable. Inspection only._
_Verified against provider-selection and service code._

## Behavior matrix

| Provider unavailable | Crash? | Error surfaced? | Degrades gracefully? | Evidence / Notes |
|---|---|---|---|---|
| **OpenAI** (`OPENAI_API_KEY` missing/down) | ❌ No | No (silent fallback) | ✅ Yes — deterministic engine output | `src/lib/creative-studio/providers/index.ts` auto-detects; falls back gemini → mock. Copy/concept/marketing-analysis have deterministic fallbacks. |
| **Gemini** (`GEMINI_API_KEY` missing/down) | ❌ No | No | ✅ Yes — falls back to OpenAI, then mock provider | Same provider selector. |
| **Image generation** (no `ZONO_IMAGE_PROVIDER`/key) | ❌ No | No | ✅ Yes — returns prompt + render object, **no fake image** | `visual-providers/index.ts` defaults to mock provider. |
| **Apify** (`APIFY_TOKEN` missing/down) | ⚠️ Throws **inside** the Apify client only | Isolated per-org/per-locality; logged to `import_jobs` | ✅ Yes — pages read DB (load fine/empty); dev uses `NODE_ENV`-gated mock; prod skips | `src/lib/transactions/providers.ts` (`apifyClient()` throws "APIFY_TOKEN missing"); callers catch per-iteration so one failure never aborts the batch or crashes a page. |
| **Meta / Facebook** (no API) | ❌ No | n/a — never attempts | ✅ Yes — manual publish assistant; "ממתין ל-Meta" gating (PHASE 6) | No live Meta call exists; distribution analytics gated behind connection status. |
| **WhatsApp** (no Meta WA API) | ❌ No | n/a — never attempts | ✅ Yes — manual assistant; never shows fake "connected/sent" | `src/lib/whatsapp/*` is manual-flow by design. |
| **Supabase** (P0 down/misconfigured) | ✅ **Yes — hard failure** | Yes (DB errors) | ❌ No graceful mode | Expected for a DB-backed app; the only true single point of failure. |
| **Google Maps** (no key) | ❌ No | No | ✅ Yes — manual coordinate entry | Property create wizard `LocationMap` falls back to manual lat/long. |

## Findings

1. **AI / image / scraper / Meta / WhatsApp failures all degrade gracefully** — no provider absence (other than Supabase) crashes the app. This is the strongest part of the production posture and was largely established in earlier phases (deterministic fallbacks, env-gated mocks, manual flows).
2. **Apify is the one "throws-but-isolated" case.** The throw is contained inside the client and every caller wraps it; the visible effect is "no new market data", not a crash. Verified isolation in transactions + external-listings services.
3. **Supabase is the only hard single point of failure** — unavoidable for the architecture. Mitigation is operational (correct env, Supabase uptime), not code.
4. **Gap: no central env-presence guard** — a missing Supabase var fails at first query, not at boot with a clear message. Recommended hardening (not implemented; out of scope): a boot assertion for the 3 P0 vars.
5. **No user-facing global error boundary verified** for server-action failures beyond per-action `{ error }` returns — most actions return typed `{ error }` and views surface Hebrew messages (good), but a top-level App Router `error.tsx`/`global-error.tsx` per segment should be confirmed before enterprise rollout.

**Net:** fail-safe behavior is **strong** — the platform is built to run without any external provider except Supabase, and never fabricates data when a provider is absent.
