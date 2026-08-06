# Retry & Failure Model

`provider-retry.ts`. Three **separate** mechanisms with separate histories/cost records:
1. **Provider transport retry** (this module) — transient only.
2. **Creative-QA regeneration** (existing `creative-qa-engine.ts`) — unchanged.
3. **Human-requested refinement** (lineage `mode: refine`).

**Retry only:** HTTP 429/502/503/504 and recognized transient timeouts/connection failures (`ETIMEDOUT`, `ECONNRESET`, `socket hang up`, `fetch failed`). **Never retry:** 400 invalid input, 401/403 auth, safety/moderation rejection, unsupported/unknown model, other permanent errors.

**Policy:** exponential backoff with full jitter, `maxAttempts` (default 3), `baseDelayMs`/`maxDelayMs`, `totalBudgetMs` (default 30s), cancellation via injected clock. `withProviderRetry` returns a structured `RetryOutcome` (never throws a handled provider error). `classifyProviderError` maps status/message to a stable class. Fully unit-tested including "succeeds after 2 transient failures" and "no retry on permanent".
